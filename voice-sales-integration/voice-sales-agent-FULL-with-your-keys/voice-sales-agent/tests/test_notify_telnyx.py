import base64
import json
import os
import time
import unittest
from pathlib import Path
from unittest import mock

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from starlette.testclient import TestClient

from app.leads import Notifier, Store, clean_lead
from app.main import create_app
from app.providers import MockLLM, MockSTT, MockTTS, Providers
from app.telnyx import TelnyxClient, TelnyxError, verify_signature

from .fakes import FakeServices, SMTPSink, base_settings, message_text, tmpdir

REC = {
    "channel": "phone", "caller": "+15550001111", "duration": 42.0, "end_reason": "agent_ended", "company": "Sunrise Solar",
    "transcript": [{"role": "user", "text": "I want solar"}, {"role": "assistant", "text": "Great!"}],
    "lead": {"name": "Junaid Alani", "phone": "+15551234567", "email": "junaidalani2001@gmail.com",
             "interest": "family solar", "outcome": "lead", "summary": "Wants family solar."},
}


class NotifierTests(unittest.TestCase):
    def test_real_smtp_delivery_to_gmail_address(self):
        sink = SMTPSink()
        try:
            s = base_settings(tmpdir(), sink=sink, email_from="agent@sunrise.test")
            status = Notifier(s).send(REC)
            msgs = sink.wait_for(1)
        finally:
            sink.stop()
        self.assertEqual(status, {"smtp": "sent"})
        self.assertEqual(len(msgs), 1)
        m = msgs[0]
        self.assertEqual(m["To"], "junaidalani2001@gmail.com")
        self.assertEqual(m["From"], "agent@sunrise.test")
        self.assertIn("Junaid Alani", m["Subject"])
        body = message_text(m)
        for needle in ("junaidalani2001@gmail.com", "+15551234567", "family solar", "I want solar", "Wants family solar."):
            self.assertIn(needle, body)

    def test_n8n_webhook_gets_full_record(self):
        svc = FakeServices()
        try:
            s = base_settings(tmpdir(), svc, n8n_webhook_url=svc.url + "/n8n", smtp_security="starttls", smtp_user="")
            status = Notifier(s).send(REC)
            req = svc.find("/n8n")[0]
        finally:
            svc.stop()
        self.assertEqual(status, {"n8n": "sent"})
        self.assertEqual(req["json"]["lead"]["email"], "junaidalani2001@gmail.com")

    def test_outbox_fallback_never_loses_lead(self):
        d = tmpdir()
        s = base_settings(d, smtp_security="starttls", smtp_user="")
        status = Notifier(s).send(REC)
        self.assertIn("outbox", status)
        self.assertIn("junaidalani2001@gmail.com", Path(status["outbox"]).read_text(encoding="utf-8"))

    def test_smtp_failure_falls_back_to_outbox(self):
        s = base_settings(tmpdir(), smtp_host="127.0.0.1", smtp_port=1, smtp_security="none")
        status = Notifier(s).send(REC)
        self.assertTrue(status["smtp"].startswith("failed"))
        self.assertIn("outbox", status)

    def test_clean_lead_validates_email(self):
        self.assertIsNone(clean_lead({"email": "not-an-email"}, None)["email"])
        self.assertEqual(clean_lead({"email": "john at example dot com"}, None)["email"], "john@example.com")
        self.assertEqual(clean_lead({}, "+1555")["phone"], "+1555")

    def test_store_roundtrip(self):
        st = Store(tmpdir())
        cid = st.save({**REC, "started": 1.0, "ended": 2.0, "outcome": "lead", "summary": "s", "notify": {"smtp": "sent"}})
        got = st.get(cid)
        self.assertEqual(got["lead"]["name"], "Junaid Alani")
        self.assertEqual(len(st.list()), 1)


class TelnyxTests(unittest.TestCase):
    def test_signature_verification(self):
        key = Ed25519PrivateKey.generate()
        pub = base64.b64encode(key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode()
        body, ts = b'{"data":{}}', str(int(time.time()))
        sig = base64.b64encode(key.sign(ts.encode() + b"|" + body)).decode()
        self.assertTrue(verify_signature(pub, sig, ts, body))
        self.assertFalse(verify_signature(pub, sig, ts, b'{"data":{"x":1}}'))
        self.assertFalse(verify_signature(pub, sig, str(int(time.time()) - 4000), body))
        self.assertFalse(verify_signature(pub, "bad", ts, body))

    def test_client_commands(self):
        svc = FakeServices()
        try:
            s = base_settings(tmpdir(), svc)
            c = TelnyxClient(s)
            c.answer("cc1")
            c.streaming_start("cc1")
            c.hangup("cc1")
            c.dial("+15551234567", {"purpose": "x"})
            sb = svc.find("/telnyx/calls/cc1/actions/streaming_start")[0]["json"]
            dial = svc.find("/telnyx/calls")[0]["json"]
            self.assertEqual(svc.find("/telnyx/calls/cc1/actions/answer")[0]["headers"]["authorization"], "Bearer tk")
            self.assertTrue(svc.find("/telnyx/calls/cc1/actions/hangup"))
        finally:
            svc.stop()
        self.assertEqual(sb["stream_url"], f"wss://agent.test/telnyx/media?token={s.ws_secret}")
        self.assertEqual((sb["stream_codec"], sb["stream_bidirectional_mode"], sb["stream_bidirectional_codec"],
                          sb["stream_bidirectional_sampling_rate"]), ("PCMU", "rtp", "PCMU", 8000))
        self.assertEqual(dial["to"], "+15551234567")
        self.assertEqual(dial["from"], "+15519007793")
        self.assertEqual(dial["connection_id"], "app-1")

    def test_client_surfaces_http_errors(self):
        svc = FakeServices()
        try:
            with self.assertRaises(TelnyxError):
                TelnyxClient(base_settings(tmpdir(), svc, telnyx_base_url=svc.url + "/nope")).answer("x")
        finally:
            svc.stop()


class WebhookTests(unittest.TestCase):
    def _wait(self, svc, path, timeout=5):
        end = time.time() + timeout
        while time.time() < end and not svc.find(path):
            time.sleep(0.05)
        return svc.find(path)

    def setUp(self):
        self.svc = FakeServices()
        self.s = base_settings(tmpdir(), self.svc)
        self.app = create_app(self.s, Providers(MockSTT(), MockLLM(), MockTTS()))

    def tearDown(self):
        self.svc.stop()

    def _event(self, et, **payload):
        return {"data": {"event_type": et, "payload": {"call_control_id": "cc9", **payload}}}

    def test_incoming_call_is_answered_then_streamed(self):
        with TestClient(self.app) as c:
            r = c.post("/telnyx/webhook", json=self._event("call.initiated", direction="incoming", **{"from": "+1555", "to": "+15519007793"}))
            self.assertEqual(r.status_code, 200)
            self.assertTrue(self._wait(self.svc, "/telnyx/calls/cc9/actions/answer"))
            c.post("/telnyx/webhook", json=self._event("call.answered", direction="incoming"))
            c.post("/telnyx/webhook", json=self._event("call.answered", direction="incoming"))  # duplicate event
            self.assertTrue(self._wait(self.svc, "/telnyx/calls/cc9/actions/streaming_start"))
            time.sleep(0.3)
            self.assertEqual(len(self.svc.find("/telnyx/calls/cc9/actions/streaming_start")), 1)

    def test_outgoing_initiated_is_not_answered(self):
        with TestClient(self.app) as c:
            c.post("/telnyx/webhook", json=self._event("call.initiated", direction="outgoing"))
            time.sleep(0.3)
        self.assertFalse(self.svc.find("/telnyx/calls/cc9/actions/answer"))

    def test_bad_payload_and_signature(self):
        with TestClient(self.app) as c:
            self.assertEqual(c.post("/telnyx/webhook", content=b"garbage").status_code, 400)
        key = Ed25519PrivateKey.generate()
        pub = base64.b64encode(key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode()
        app = create_app(base_settings(tmpdir(), self.svc, telnyx_public_key=pub), Providers(MockSTT(), MockLLM(), MockTTS()))
        body = json.dumps(self._event("call.initiated", direction="incoming")).encode()
        ts = str(int(time.time()))
        good = base64.b64encode(key.sign(ts.encode() + b"|" + body)).decode()
        with TestClient(app) as c:
            self.assertEqual(c.post("/telnyx/webhook", content=body).status_code, 401)
            ok = c.post("/telnyx/webhook", content=body, headers={"telnyx-signature-ed25519": good, "telnyx-timestamp": ts})
            self.assertEqual(ok.status_code, 200)

    def test_media_websocket_rejects_bad_token(self):
        from starlette.websockets import WebSocketDisconnect
        with TestClient(self.app) as c:
            with self.assertRaises(WebSocketDisconnect):
                with c.websocket_connect("/telnyx/media?token=wrong"):
                    pass


if __name__ == "__main__":
    unittest.main()
