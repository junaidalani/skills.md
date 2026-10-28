import asyncio
import json
import threading
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests
from starlette.testclient import TestClient

from app.carriers import signature_for
from app.main import create_app
from app.tenancy import TenantRegistry, apply_config, normalize_number

from .fakes import base_settings, tmpdir

PAYLOAD = {
    "tenantId": "t1",
    "business": {"company": "Acme Plumbing", "agent_name": "Riley",
                 "greeting": "Acme Plumbing, how can I help?",
                 "actions": [{"type": "email", "to": "owner@acme.test"}]},
    "actions": [{"type": "email", "to": "owner@acme.test"}],
    "providers": {
        "llm": {"provider": "openai", "base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini", "api_key": "sk-llm"},
        "tts": {"provider": "openai", "base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini-tts",
                "api_key": "sk-tts", "format": "mp3"},
        "stt": {"provider": "openai", "base_url": "https://api.openai.com/v1", "model": "whisper-1", "api_key": "sk-stt"},
    },
    "email": {"to": "owner@acme.test", "resend_api_key": "re-1"},
    "warnings": [],
}


class Resp:
    def __init__(self, status, body):
        self.status_code, self._body = status, body

    def json(self):
        return self._body


def http_returning(*responses):
    calls = []

    def http(url, **kw):
        calls.append((url, kw.get("params")))
        r = responses[min(len(calls) - 1, len(responses) - 1)]
        if isinstance(r, Exception):
            raise r
        return r
    http.calls = calls
    return http


class TenancyTest(unittest.TestCase):
    def registry(self, *responses):
        return TenantRegistry(base_settings(tmpdir()), "https://app.test", "secret", http=http_returning(*responses))

    def test_numbers_are_normalised(self):
        self.assertEqual(normalize_number("+1 (555) 123-4567"), "+15551234567")
        self.assertEqual(normalize_number("15551234567"), "+15551234567")
        self.assertEqual(normalize_number(""), "")

    def test_single_tenant_mode_is_off_without_url(self):
        r = TenantRegistry(base_settings(tmpdir()))
        self.assertFalse(r.enabled)
        self.assertIsNone(asyncio.run(r.resolve("+15551234567")))

    def test_tenant_keys_and_business_are_applied(self):
        r = self.registry(Resp(200, PAYLOAD))
        t = asyncio.run(r.resolve("+1 (555) 123-4567"))
        self.assertEqual(t.id, "t1")
        self.assertEqual(t.business["company"], "Acme Plumbing")
        self.assertEqual(t.settings.llm_api_key, "sk-llm")
        self.assertEqual(t.settings.tts_api_key, "sk-tts")
        self.assertEqual(t.settings.stt_model, "whisper-1")
        self.assertEqual(t.settings.lead_email_to, "owner@acme.test")
        self.assertEqual(t.settings.resend_api_key, "re-1")
        self.assertEqual(t.settings.llm_fallback_models, [])  # tenant models never leak platform fallbacks
        self.assertEqual(t.actions[0]["to"], "owner@acme.test")
        self.assertEqual(r.http.calls[0][1], {"to": "+15551234567"})

    def test_answer_is_cached_for_a_minute(self):
        r = self.registry(Resp(200, PAYLOAD))
        asyncio.run(r.resolve("+15551234567"))
        asyncio.run(r.resolve("+15551234567"))
        self.assertEqual(len(r.http.calls), 1)

    def test_unknown_number_is_refused_and_not_hammering(self):
        r = self.registry(Resp(404, {"error": "no tenant"}))
        self.assertIsNone(asyncio.run(r.resolve("+15550000000")))
        self.assertIsNone(asyncio.run(r.resolve("+15550000000")))
        self.assertEqual(len(r.http.calls), 1)

    def test_site_outage_uses_last_good_answer_then_errors(self):
        r = self.registry(Resp(200, PAYLOAD), requests.ConnectionError("down"))
        t = asyncio.run(r.resolve("+15551234567"))
        r._cache["+15551234567"] = (0, t)  # expired, but still the last good answer
        self.assertIs(asyncio.run(r.resolve("+15551234567")), t)
        cold = self.registry(requests.ConnectionError("down"))
        with self.assertRaises(RuntimeError):
            asyncio.run(cold.resolve("+19995551234"))

    def test_bring_your_own_twilio_number_is_used_for_that_tenant(self):
        s = apply_config(base_settings(tmpdir()), {"telephony": {
            "provider": "twilio", "account_sid": "AC123", "auth_token": "tok", "phone_number": "+15551234567"}})
        self.assertEqual(s.twilio_auth_token, "tok")
        self.assertEqual(s.twilio_account_sid, "AC123")
        self.assertEqual(s.twilio_signing_token, "tok")
        self.assertEqual(s.twilio_phone_number, "+15551234567")
        self.assertEqual(base_settings(tmpdir()).twilio_auth_token, "")  # platform settings untouched

    def test_bring_your_own_telnyx_number_is_used_for_that_tenant(self):
        s = apply_config(base_settings(tmpdir()), {"telephony": {
            "provider": "telnyx", "api_key": "KEY123", "phone_number": "+15519007793", "connection_id": "app-9"}})
        self.assertEqual(s.telnyx_api_key, "KEY123")
        self.assertEqual(s.telnyx_phone_number, "+15519007793")
        self.assertEqual(s.telnyx_connection_id, "app-9")
        self.assertNotEqual(base_settings(tmpdir()).telnyx_api_key, "KEY123")  # platform settings untouched

    def test_plan_call_cap_is_applied_and_a_bad_one_is_ignored(self):
        base = base_settings(tmpdir())
        self.assertEqual(apply_config(base, {"limits": {"maxCallSeconds": 600}}).max_call_s, 600)
        self.assertEqual(apply_config(base, {"limits": {"maxCallSeconds": "soon"}}).max_call_s, base.max_call_s)
        self.assertEqual(apply_config(base, {}).max_call_s, base.max_call_s)

    def test_broken_tenant_config_refuses_the_call_instead_of_using_platform_keys(self):
        bad = {**PAYLOAD, "providers": {"tts": {"provider": "not-a-provider", "api_key": "x", "base_url": "u"}}}
        r = self.registry(Resp(200, bad))
        self.assertIsNone(asyncio.run(r.resolve("+15551234567")))

    def test_inactive_number_is_refused(self):
        r = self.registry(Resp(409, {"error": "not active"}))
        self.assertIsNone(asyncio.run(r.resolve("+15551234567")))


class TenantWebhookTest(unittest.TestCase):
    """The real Twilio webhook against a fake session-config endpoint: the tenant's own token verifies
    its own number, and another number gets a spoken refusal instead of someone else's line."""

    NUMBER = "+15551234567"
    TOKEN = "tenant-token-1234"

    def test_tenant_own_token_answers_its_number_and_refuses_the_rest(self):
        payload = {**PAYLOAD, "telephony": {
            "provider": "twilio", "account_sid": "AC123", "auth_token": self.TOKEN, "phone_number": self.NUMBER}}

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                to = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("to", [""])[0]
                ok = to == TenantWebhookTest.NUMBER
                body = json.dumps(payload if ok else {"error": "no tenant"}).encode()
                self.send_response(200 if ok else 404)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            s = base_settings(tmpdir(), tenancy_url=f"http://127.0.0.1:{server.server_port}",
                              tenancy_secret="site-secret")
            url = s.twilio_voice_url
            params = {"CallSid": "CA1", "From": "+447700900123", "To": self.NUMBER}
            with TestClient(create_app(s)) as c:
                good = c.post("/twilio/voice", data=params, headers={
                    "X-Twilio-Signature": signature_for(self.TOKEN, url, params)})
                bad = c.post("/twilio/voice", data=params, headers={"X-Twilio-Signature": "bogus"})
                unknown = c.post("/twilio/voice", data={"CallSid": "CA2", "To": "+19995551234"},
                                 headers={"X-Twilio-Signature": "bogus"})
        finally:
            server.shutdown()
        self.assertEqual(good.status_code, 200)
        self.assertIn("<Connect><Stream", good.text)
        self.assertIn(f"token={s.ws_secret}", good.text)
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(unknown.status_code, 200)  # Twilio must get TwiML, not an error page
        self.assertIn("<Say", unknown.text)
        self.assertNotIn("token=", unknown.text)  # never leak the media token to an unlisted number


if __name__ == "__main__":
    unittest.main()
