import base64
import json
import unittest
from unittest import mock

from starlette.testclient import TestClient

from app.carriers import TwilioClient, TwilioError, signature_for, twiml, verify_signature
from app.main import create_app

from .fakes import base_settings, tmpdir

# Twilio's documented test vector (docs "Validating Signatures").
AUTH = "12345"
URL = "https://example.com/myapp.php?foo=1&bar=2"
PARAMS = {"CallSid": "CA1234567890ABCDE", "Caller": "+14158675310", "Digits": "1234",
          "From": "+14158675310", "To": "+18005551212"}
EXPECTED = "L/OH5YylLD5NRKLltdqwSvS0BnU="


class SignatureTests(unittest.TestCase):
    def test_documented_vector(self):
        self.assertEqual(signature_for(AUTH, URL, PARAMS), EXPECTED)

    def test_verify_accepts_and_rejects(self):
        self.assertTrue(verify_signature(AUTH, EXPECTED, URL, PARAMS))
        self.assertFalse(verify_signature(AUTH, EXPECTED, URL, {**PARAMS, "Digits": "9999"}))
        self.assertFalse(verify_signature("wrong", EXPECTED, URL, PARAMS))
        self.assertFalse(verify_signature("", EXPECTED, URL, PARAMS))

    def test_param_order_does_not_matter(self):
        shuffled = dict(reversed(list(PARAMS.items())))
        self.assertEqual(signature_for(AUTH, URL, shuffled), EXPECTED)


class TwimlTests(unittest.TestCase):
    def test_stream_handoff(self):
        xml = twiml("wss://agent.test/twilio/media?token=t", "t", "CA1", "+447700900123", "+441349800007")
        self.assertIn('<Connect><Stream url="wss://agent.test/twilio/media?token=t">', xml)
        self.assertIn('<Parameter name="token" value="t"/>', xml)
        self.assertIn('<Parameter name="callSid" value="CA1"/>', xml)
        self.assertIn('<Parameter name="from" value="+447700900123"/>', xml)
        self.assertIn('<Parameter name="to" value="+441349800007"/>', xml)

    def test_escapes_xml(self):
        xml = twiml("wss://a.test/x?a=1&b=2", "t", "CA1")
        self.assertIn("a=1&amp;b=2", xml)


class VoiceWebhookTests(unittest.TestCase):
    def settings(self, **over):
        return base_settings(tmpdir(), twilio_account_sid="AC123", twilio_auth_token=AUTH,
                             twilio_phone_number="+441349800007", **over)

    def post(self, client, params, signature=None):
        url = "https://agent.test/twilio/voice"
        sig = signature if signature is not None else signature_for(AUTH, url, params)
        return client.post("/twilio/voice", data=params, headers={"X-Twilio-Signature": sig})

    def test_valid_signature_returns_twiml(self):
        app = create_app(self.settings())
        with TestClient(app) as c:
            r = self.post(c, {"CallSid": "CA1", "From": "+447700900123", "To": "+441349800007"})
        self.assertEqual(r.status_code, 200)
        self.assertIn("<Connect><Stream", r.text)
        self.assertIn("CA1", r.text)

    def test_bad_signature_is_401(self):
        app = create_app(self.settings())
        with TestClient(app) as c:
            r = self.post(c, {"CallSid": "CA1", "To": "+441349800007"}, signature="bogus")
        self.assertEqual(r.status_code, 401)

    def test_tampered_param_is_401(self):
        app = create_app(self.settings())
        url = "https://agent.test/twilio/voice"
        sig = signature_for(AUTH, url, {"CallSid": "CA1", "To": "+441349800007"})
        with TestClient(app) as c:
            r = self.post(c, {"CallSid": "CA2", "To": "+441349800007"}, signature=sig)
        self.assertEqual(r.status_code, 401)

    def test_media_token_matches_ws_secret(self):
        s = self.settings()
        app = create_app(s)
        with TestClient(app) as c:
            r = self.post(c, {"CallSid": "CA1", "To": "+441349800007"})
        self.assertIn(f"token={s.ws_secret}", r.text)


class MediaSocketTests(unittest.TestCase):
    def test_wrong_token_closes(self):
        app = create_app(base_settings(tmpdir()))
        with TestClient(app) as c:
            with self.assertRaises(Exception):
                with c.websocket_connect("/twilio/media?token=nope") as ws:
                    ws.receive_text()

    def test_start_media_stop(self):
        app = create_app(base_settings(tmpdir(), twilio_account_sid="AC123", twilio_auth_token=AUTH,
                                       twilio_phone_number="+441349800007"))
        s = app.state.ctx.settings
        with TestClient(app) as c:
            with c.websocket_connect(f"/twilio/media?token={s.ws_secret}") as ws:
                ws.send_text(json.dumps({"event": "connected"}))
                ws.send_text(json.dumps({"event": "start", "start": {
                    "streamSid": "MZ1", "callSid": "CA1", "to": "+441349800007",
                    "customParameters": {"token": s.ws_secret, "callSid": "CA1"}}}))
                ws.send_text(json.dumps({"event": "media", "media": {
                    "track": "inbound", "payload": base64.b64encode(b"\x7f" * 160).decode()}}))
                ws.send_text(json.dumps({"event": "stop"}))


class ClientTests(unittest.TestCase):
    def test_auth_prefers_api_key(self):
        s = base_settings(tmpdir(), twilio_account_sid="AC1", twilio_auth_token="tok",
                          twilio_api_key_sid="SK1", twilio_api_key_secret="sec")
        self.assertEqual(TwilioClient(s).auth, ("SK1", "sec"))

    def test_auth_falls_back_to_account(self):
        s = base_settings(tmpdir(), twilio_account_sid="AC1", twilio_auth_token="tok")
        self.assertEqual(TwilioClient(s).auth, ("AC1", "tok"))

    def test_hangup_needs_account_sid(self):
        s = base_settings(tmpdir(), twilio_account_sid="", twilio_api_key_sid="SK1", twilio_api_key_secret="sec")
        with self.assertRaises(TwilioError):
            TwilioClient(s).hangup("CA1")

    def test_hangup_posts_completed(self):
        s = base_settings(tmpdir(), twilio_account_sid="AC1", twilio_auth_token="tok")
        with mock.patch("app.carriers.requests.post") as post:
            post.return_value = mock.Mock(status_code=200, content=b"{}")
            TwilioClient(s).hangup("CA1")
        url = post.call_args.args[0]
        self.assertTrue(url.endswith("/Accounts/AC1/Calls/CA1.json"))
        self.assertEqual(post.call_args.kwargs["data"], {"Status": "completed"})

    def test_probe_explains_401(self):
        s = base_settings(tmpdir(), twilio_account_sid="AC1", twilio_auth_token="tok")
        with mock.patch("app.carriers.requests.get") as get:
            get.return_value = mock.Mock(status_code=401, text="{}")
            self.assertIn("401", TwilioClient(s).probe())
