"""Multi-tenant platform bridge: session-config fetch, per-call overrides, call reporting."""
import base64
import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np
from starlette.testclient import TestClient

from app.audio import ulaw_decode, ulaw_encode
from app.config import Settings
from app.main import create_app
from app.providers import Providers
from app.platform import (
    TenantConfig,
    build_tenant_business,
    call_ended_payload,
    fetch_session_config,
    platform_outcome,
    platform_ready,
    report_call_ended,
)

from .fakes import FakeServices, base_settings, tmpdir
from .test_calls import PhoneCall, mock_providers, silence, tone

SECRET = "sek"
TO = "+15551112222"

TENANT_CFG: dict = {
    "tenantId": "tenant-uuid-1",
    "agentId": "agent-uuid-1",
    "planId": "starter",
    "limits": {"maxCallSeconds": 900, "minutesRemaining": 120},
    "business": {
        "company": "Callback Plumbing",
        "agent_name": "Piper",
        "greeting": "Thanks for calling Callback Plumbing, this is Piper. How can I help?",
        "personality": "Direct, warm, and concise.",
        "about": "24/7 plumbing repairs, no call-out fee.",
        "business_hours": "24/7",
        "goal": "Capture the caller's address and issue, then book a visit.",
        "collect": ["address", "issue description", "callback number"],
    },
    "providers": {
        "llm": {"provider": "openai", "base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini", "api_key": "tenant-key"},
    },
    "telephony": {"provider": "telnyx", "api_key": "tenant-telnyx-key"},
    "email": {"to": "owner@example.com"},
    "actions": [{"type": "calendar", "url": "https://cal.example", "secret": "cal-secret"}],
    "warnings": [],
}


def make_platform_server():
    """Fake platform website serving /api/voice/session-config + /api/voice/call-ended."""
    recorded = {"session_to": "", "ended": []}

    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.0"

        def log_message(self, *a):  # silence
            pass

        def _send(self, code: int, obj: dict) -> None:
            b = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def do_GET(self) -> None:
            u = urlparse(self.path)
            if u.path != "/api/voice/session-config":
                return self._send(404, {"error": "not found"})
            if self.headers.get("Authorization") != f"Bearer {SECRET}":
                return self._send(401, {"error": "Unauthorized."})
            to = (parse_qs(u.query).get("to") or [""])[0]
            if to != TO:
                return self._send(404, {"error": "This number is not assigned to a tenant."})
            recorded["session_to"] = to
            self._send(200, TENANT_CFG)

        def do_POST(self) -> None:
            n = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(n)
            recorded["ended"].append({
                "auth": self.headers.get("Authorization"),
                "json": json.loads(raw) if raw else None,
            })
            self._send(200, {"received": True, "callId": "platform-call-id"})

    server = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_port}", recorded


def unconfigured_settings(tmp) -> Settings:
    return base_settings(tmp)


class HelperTests(unittest.TestCase):
    def test_platform_ready(self):
        s = unconfigured_settings(tmpdir())
        self.assertFalse(platform_ready(s))
        s2 = base_settings(tmpdir(), platform_base_url="https://site.test", voice_webhook_secret=SECRET)
        self.assertTrue(platform_ready(s2))

    def test_build_tenant_business_maps_and_fills_defaults(self):
        biz = build_tenant_business({"company": "  X Co  \n", "agent_name": "", "goal": "Book visits"})
        self.assertEqual(biz["company"], "X Co")
        self.assertEqual(biz["agent_name"], "Assistant")
        self.assertIn("X Co", biz["greeting"])
        self.assertEqual(biz["goal"], "Book visits")
        self.assertEqual(biz["collect"], ["full name", "best phone number", "reason for calling"])

    def test_build_tenant_business_passes_collect(self):
        biz = build_tenant_business({"collect": ["address", "issue"]})
        self.assertEqual(biz["collect"], ["address", "issue"])

    def test_platform_outcome_mapping(self):
        spoke = {"transcript": [{"role": "user", "text": "hi"}], "outcome": "lead"}
        empty_voice = {"transcript": [{"role": "assistant", "text": "greeting"}], "outcome": "no_action"}
        self.assertEqual(platform_outcome(spoke), "answered")
        self.assertEqual(platform_outcome(empty_voice), "missed")
        self.assertEqual(platform_outcome({"outcome": "voicemail", "transcript": []}), "voicemail")

    def test_call_ended_payload_shape(self):
        cfg = TenantConfig(tenant_id="t1", settings=unconfigured_settings(tmpdir()),
                           providers=Providers(stt=None, llm=None, tts=None), telnyx=None,
                           business={}, actions=[], warnings=[])
        rec = {
            "call_id": "cc-1", "callee": TO, "caller": "+15550001111",
            "started": 100.0, "ended": 160.0, "duration": 60.0,
            "outcome": "lead", "summary": "Wants plumbing.",
            "transcript": [
                {"role": "assistant", "text": "hello", "ts": 0.0},
                {"role": "user", "text": "my sink leaks", "ts": 5.5},
            ],
            "lead": {"name": "Ann", "phone": "+15550001112", "email": "a@b.co", "interest": "sink", "next_step": "call back"},
        }
        payload = call_ended_payload(cfg, rec)
        self.assertEqual(payload["callId"], "cc-1")
        self.assertEqual(payload["to"], TO)
        self.assertEqual(payload["from"], "+15550001111")
        self.assertEqual(payload["outcome"], "answered")
        self.assertEqual(payload["durationSeconds"], 60)
        self.assertEqual([t["role"] for t in payload["turns"]], ["agent", "user"])
        self.assertAlmostEqual(payload["turns"][1]["at"], 105.5)
        # the platform parses startedAt/endedAt with Date.parse -> must be ISO strings
        self.assertTrue(str(payload["startedAt"]).startswith("1970-01-01T00:01:40"))
        self.assertTrue(str(payload["endedAt"]).startswith("1970-01-01T00:02:40"))
        self.assertEqual(payload["lead"]["name"], "Ann")
        self.assertEqual(payload["lead"]["reason"], "sink")
        self.assertEqual(payload["lead"]["fields"].get("next_step"), "call back")
        self.assertNotIn("summary", payload["lead"])
        result = report_call_ended(base_settings(tmpdir(), platform_base_url="https://never.test"), cfg, rec)
        self.assertFalse(result)  # unreachable platform -> reported as failure, no exception


class FetchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server, cls.url, _recorded = make_platform_server()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def _settings(self, tmp, secret=SECRET) -> Settings:
        return base_settings(tmp, platform_base_url=self.url, voice_webhook_secret=secret)

    def test_wrong_secret_yields_fallback(self):
        cfg = fetch_session_config(self._settings(tmpdir(), secret="wrong"), TO)
        self.assertIsNone(cfg)

    def test_unassigned_number_yields_fallback(self):
        cfg = fetch_session_config(self._settings(tmpdir()), "+19999999999")
        self.assertIsNone(cfg)

    def test_offline_platform_yields_fallback(self):
        cfg = fetch_session_config(
            base_settings(tmpdir(), platform_base_url="https://offline.invalid", voice_webhook_secret=SECRET), TO)
        self.assertIsNone(cfg)

    def test_builds_tenant_config(self):
        cfg = fetch_session_config(self._settings(tmpdir()), TO)
        self.assertIsNotNone(cfg)
        assert cfg is not None
        self.assertEqual(cfg.tenant_id, "tenant-uuid-1")
        # tenant's own providers replace the deployment defaults where given
        self.assertIsNotNone(cfg.providers.llm)
        self.assertEqual(cfg.providers.llm.s.openrouter_api_key, "tenant-key")
        self.assertEqual(cfg.providers.llm.s.openrouter_base_url, "https://api.openai.com/v1")
        self.assertEqual(cfg.providers.llm.s.llm_model, "gpt-4o-mini")
        self.assertEqual(cfg.providers.llm.s.llm_fallback_models, [])
        self.assertIsNone(cfg.providers.stt)  # tenant brings none -> fall back to server defaults
        self.assertIsNone(cfg.providers.tts)
        self.assertIsNotNone(cfg.telnyx)
        assert cfg.telnyx is not None
        self.assertEqual(cfg.telnyx.s.telnyx_api_key, "tenant-telnyx-key")
        # remaining plan minutes cap the call length
        self.assertLessEqual(cfg.settings.max_call_s, 900.0)
        self.assertEqual(cfg.business["company"], "Callback Plumbing")
        self.assertEqual(cfg.actions[0]["type"], "calendar")

    def test_reports_call_ended(self):
        server, url, recorded = make_platform_server()
        try:
            cfg = fetch_session_config(
                base_settings(tmpdir(), platform_base_url=url, voice_webhook_secret=SECRET), TO)
            rec = {"call_id": "cc-2", "callee": TO, "caller": "+15550001111", "started": 200.0,
                   "ended": 260.0, "duration": 60.0, "outcome": "lead", "summary": "ok",
                   "transcript": [{"role": "user", "text": "help"}],
                   "lead": {"name": "Bo", "email": None, "phone": None, "interest": None}}
            self.assertTrue(report_call_ended(
                base_settings(tmpdir(), platform_base_url=url, voice_webhook_secret=SECRET), cfg, rec))
            self.assertTrue(recorded["ended"])
            self.assertEqual(recorded["ended"][0]["json"]["callId"], "cc-2")
            self.assertEqual(recorded["ended"][0]["auth"], f"Bearer {SECRET}")
        finally:
            server.shutdown()


# end

class FullTenantCallTests(unittest.TestCase):
    """A real call end to end: webhook -> tenant answer -> media ws -> transcript -> report."""

    def test_full_tenant_call(self):
        platform_server, platform_url, recorded = make_platform_server()
        svc = FakeServices()
        svc.llm_reply = "Perfect, thanks for calling Callback Plumbing. Goodbye! [[END_CALL]]"
        # route the tenant's own LLM to the fake OpenAI-compatible endpoint
        TENANT_CFG["providers"]["llm"]["base_url"] = svc.url + "/or"
        try:
            s = base_settings(tmpdir(), svc,
                              platform_base_url=platform_url, voice_webhook_secret=SECRET)
            app = create_app(s, mock_providers())
            with TestClient(app) as c:
                # 1. Telnyx announces an incoming call to the tenant's number
                resp = c.post("/telnyx/webhook", json={"data": {
                    "event_type": "call.initiated",
                    "payload": {"direction": "incoming", "call_control_id": "cc-9",
                                 "to": TO, "from": "+15550001111"},
                }})
                self.assertEqual(resp.status_code, 200)

                def answered_with_tenant_key():
                    return any(r["path"].endswith("/calls/cc-9/actions/answer")
                               and r["headers"].get("authorization") == "Bearer tenant-telnyx-key"
                               for r in svc.requests)
                self.assertTrue(
                    _wait(answered_with_tenant_key), "call was not answered with the tenant's Telnyx key")

                # 2. Media websocket opens for that call; the agent greets as the tenant
                call = TenantPhoneCall(c, s.ws_secret)
                try:
                    self.assertTrue(_wait(lambda: len(call.audio_bytes()) > 1200), "greeting audio missing")
                    call.turn()  # caller speaks (MockSTT supplies words)
                    self.assertTrue(_wait(
                        lambda: any(r["path"].endswith("/calls/cc-9/actions/hangup")
                                    and r["headers"].get("authorization") == "Bearer tenant-telnyx-key"
                                    for r in svc.requests)),
                        "agent did not hang up with the tenant key")

                    # 3. The platform received the call record
                    def reported():
                        return bool(recorded["ended"])
                    self.assertTrue(_wait(reported), "call-ended report missing")
                    body = recorded["ended"][-1]
                    self.assertEqual(body["auth"], f"Bearer {SECRET}")
                    self.assertEqual(body["json"]["callId"], "cc-9")
                    self.assertEqual(body["json"]["to"], TO)
                    self.assertEqual(body["json"]["outcome"], "answered")
                    self.assertEqual(body["json"]["lead"]["name"], "Junaid Alani")
                    self.assertTrue(len(body["json"]["turns"]) >= 2)

                    # 4. The call is stored locally against the tenant's number and persona
                    calls = c.get("/api/calls", headers={"authorization": "Bearer adm"}).json()["calls"]
                    self.assertTrue(calls)
                    self.assertEqual(calls[0]["callee"], TO)
                    self.assertEqual(calls[0]["notify"], {"skipped": "platform handles notifications"})
                    # greeting spoken as the tenant persona
                    self.assertEqual(calls[0]["transcript"][0]["text"], TENANT_CFG["business"]["greeting"])
                finally:
                    call.hangup()
        finally:
            svc.stop()
            platform_server.shutdown()


class TenantPhoneCall(PhoneCall):
    """PhoneCall that dials the tenant's number on the media websocket."""

    def __init__(self, client, token):
        self.ws = client.websocket_connect(f"/telnyx/media?token={token}").__enter__()
        self.out: list[dict] = []
        self._t = threading.Thread(target=self._reader, daemon=True)
        self._t.start()
        self.ws.send_text(json.dumps({"event": "connected", "version": "1.0.0"}))
        self.ws.send_text(json.dumps({"event": "start", "stream_id": "s9", "start": {
            "call_control_id": "cc-9", "from": "+15550001111", "to": TO,
            "media_format": {"encoding": "PCMU", "sample_rate": 8000, "channels": 1}}}))

    def speak(self, pcm):
        data = ulaw_encode(pcm)
        for i in range(0, len(data), 160):
            self.ws.send_text(json.dumps({"event": "media", "sequence_number": "1", "media": {
                "track": "inbound", "payload": base64.b64encode(data[i:i + 160]).decode()}}))

    def turn(self, secs=1.0):
        self.speak(silence(0.4))
        self.speak(tone(secs))
        self.speak(silence(1.2))

    def hangup(self):
        self.ws.send_text(json.dumps({"event": "stop"}))
        self.ws.__exit__(None, None, None)

    def audio_bytes(self):
        return b"".join(base64.b64decode(m["media"]["payload"]) for m in self.out if m.get("event") == "media")

    def _reader(self):
        while True:
            try:
                self.out.append(json.loads(self.ws.receive_text()))
            except Exception:  # noqa: BLE001 - closed
                return


def _wait(cond, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end and not cond():
        time.sleep(0.05)
    return cond()


if __name__ == "__main__":
    unittest.main()
