import asyncio
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock

import yaml
from dotenv import dotenv_values

from app.config import ROOT, ConfigError, Settings, problems
from app.leads import Notifier
from app.providers import (ElevenLabsTTS, HFWhisperSTT, MockLLM, OpenAICompatLLM, OpenAICompatSTT, OpenAICompatTTS,
                           build_providers)

from .fakes import FakeServices, SMTPSink, base_settings, message_text, tmpdir

CLEAN_ENV = {"VSA_NO_DOTENV": "1"}


def load(yaml_text: str | None = None, env: dict | None = None) -> Settings:
    """Load settings from a temp agent.yaml with a clean environment."""
    d = Path(tempfile.mkdtemp())
    path = d / "agent.yaml"
    path.write_text(textwrap.dedent(yaml_text or ""), encoding="utf-8")
    with mock.patch.dict(os.environ, {**CLEAN_ENV, **(env or {})}, clear=True):
        return Settings.load(path)


def run(coro):
    return asyncio.run(coro)


KEY_SHAPES = [r"sk-or-v1-[A-Za-z0-9]{20,}", r"hf_[A-Za-z0-9]{20,}", r"KEY0[0-9A-Z]{10,}_[A-Za-z0-9]{10,}", r"gsk_[A-Za-z0-9]{20,}"]


def find_secrets(blob: bytes) -> list[str]:
    """Key-shaped strings plus every real value in the local .env (never written into this file)."""
    import re
    found = [m.group(0).decode()[:8] + "..." for pat in KEY_SHAPES for m in re.finditer(pat.encode(), blob)]
    env_path = ROOT / ".env"
    if env_path.exists():
        for k, v in dotenv_values(env_path).items():
            is_secret_name = any(w in k.upper() for w in ("KEY", "TOKEN", "PASS", "SECRET"))
            if v and len(v) >= 8 and is_secret_name and k != "TELNYX_PUBLIC_KEY":
                for variant in {v, v.replace(" ", "")}:
                    if variant.encode() in blob:
                        found.append(f"{k} value")
    return found


class SwitchingProvidersTests(unittest.TestCase):
    def test_shipped_defaults(self):
        with mock.patch.dict(os.environ, CLEAN_ENV, clear=True):
            s = Settings.load(ROOT / "agent.yaml")
        self.assertEqual((s.llm_provider, s.llm_base_url, s.llm_model), ("openrouter", "https://openrouter.ai/api/v1", "nvidia/nemotron-3-ultra-550b-a55b:free"))
        self.assertEqual((s.tts_provider, s.tts_base_url, s.tts_model), ("custom", "http://localhost:8787/v1", "aria"))
        self.assertEqual((s.stt_provider, s.stt_base_url, s.stt_model), ("custom", "http://localhost:8788/v1", "base.en"))
        self.assertEqual(s.llm_fallback_models, ["google/gemma-4-31b-it:free", "nvidia/nemotron-3-super-120b-a12b:free"])

    def test_changing_one_word_switches_provider_model_url_and_key(self):
        s = load("""
            keys: {groq: gsk_abc, elevenlabs: el_key, openai: oa_key, openrouter: or_key}
            llm: {provider: groq}
            voice: {provider: elevenlabs}
            listening: {provider: groq}
        """)
        self.assertEqual((s.llm_base_url, s.llm_api_key, s.llm_model), ("https://api.groq.com/openai/v1", "gsk_abc", "llama-3.3-70b-versatile"))
        self.assertEqual(s.llm_fallback_models, [])  # openrouter-only fallbacks are not carried over
        self.assertEqual((s.tts_provider, s.tts_api_key, s.tts_model, s.tts_voice), ("elevenlabs", "el_key", "eleven_turbo_v2_5", "21m00Tcm4TlvDq8ikWAM"))
        self.assertEqual((s.stt_base_url, s.stt_api_key, s.stt_model), ("https://api.groq.com/openai/v1", "gsk_abc", "whisper-large-v3-turbo"))

    def test_openai_everything(self):
        s = load("""
            keys: {openai: oa}
            llm: {provider: openai}
            voice: {provider: openai}
            listening: {provider: openai}
        """)
        self.assertEqual((s.llm_model, s.tts_model, s.tts_voice, s.stt_model), ("gpt-4o-mini", "gpt-4o-mini-tts", "alloy", "whisper-1"))
        self.assertTrue(all(k == "oa" for k in (s.llm_api_key, s.tts_api_key, s.stt_api_key)))

    def test_custom_provider_uses_base_url_and_section_key(self):
        s = load("""
            keys: {custom: shared}
            llm: {provider: custom, base_url: "https://my.host/v1/", model: my-model, api_key: sect}
        """)
        self.assertEqual((s.llm_base_url, s.llm_model, s.llm_api_key), ("https://my.host/v1", "my-model", "sect"))

    def test_aliases_and_case(self):
        s = load("listening: {provider: HuggingFace}\nvoice: {provider: Eleven Labs}\nkeys: {huggingface: h, elevenlabs: e}")
        self.assertEqual((s.stt_provider, s.stt_api_key, s.tts_provider, s.tts_api_key), ("hf", "h", "elevenlabs", "e"))

    def test_key_lookup_order(self):
        yaml_text = "keys: {openrouter: from_keys}\nllm: {api_key: from_section}\n"
        self.assertEqual(load("keys: {openrouter: from_keys}").llm_api_key, "from_keys")
        self.assertEqual(load("keys: {openrouter: from_keys}", {"OPENROUTER_API_KEY": "from_env"}).llm_api_key, "from_env")
        self.assertEqual(load(yaml_text, {"OPENROUTER_API_KEY": "from_env"}).llm_api_key, "from_section")
        self.assertEqual(load(yaml_text, {"OPENROUTER_API_KEY": "e", "LLM_API_KEY": "override"}).llm_api_key, "override")

    def test_env_beats_yaml_beats_default(self):
        y = "llm: {model: yaml-model}\nserver: {public_url: https://yaml.example}"
        self.assertEqual(load(y).llm_model, "yaml-model")
        self.assertEqual(load(y, {"LLM_MODEL": "env-model"}).llm_model, "env-model")
        self.assertEqual(load("").llm_model, "meta-llama/llama-3.3-70b-instruct:free")
        self.assertEqual(load(y).public_base_url, "https://yaml.example")

    def test_missing_file_uses_defaults_and_bad_yaml_is_explained(self):
        with mock.patch.dict(os.environ, CLEAN_ENV, clear=True):
            self.assertEqual(Settings.load(Path("/nonexistent/agent.yaml")).llm_provider, "openrouter")
        with self.assertRaises(ConfigError) as cm:
            load("llm: [unclosed")
        self.assertIn("not valid YAML", str(cm.exception))


class ValidationTests(unittest.TestCase):
    def errors(self, s):
        return [m for lvl, m in problems(s) if lvl == "error"]

    def test_missing_keys_name_exactly_where_to_put_them(self):
        errs = self.errors(load("llm: {provider: groq}\nvoice: {provider: elevenlabs}\nemail: {send_leads_to: a@b.co}"))
        text = "\n".join(errs)
        self.assertIn("keys.groq", text)
        self.assertIn("keys.elevenlabs", text)
        self.assertIn("keys.openrouter", "\n".join(self.errors(load("email: {send_leads_to: a@b.co}"))))

    def test_unknown_provider_lists_choices(self):
        errs = self.errors(load("llm: {provider: banana}\nemail: {send_leads_to: a@b.co}\nkeys: {openrouter: x, huggingface: y}"))
        self.assertTrue(any("banana" in e and "openrouter" in e and "groq" in e for e in errs))

    def test_custom_needs_base_url(self):
        errs = self.errors(load("llm: {provider: custom, model: m}\nkeys: {custom: k}\nemail: {send_leads_to: a@b.co}"))
        self.assertTrue(any("base_url" in e for e in errs))

    def test_ollama_needs_no_key(self):
        errs = self.errors(load("llm: {provider: ollama}\nkeys: {openrouter: x, huggingface: y}\nemail: {send_leads_to: a@b.co}"))
        self.assertFalse(any("llm" in e and "key" in e for e in errs))

    def test_good_config_has_no_errors_and_warns_about_defaults(self):
        s = load("keys: {openrouter: x, huggingface: y}\nemail: {send_leads_to: a@b.co}")
        self.assertEqual(self.errors(s), [])
        warns = " ".join(m for lvl, m in problems(s) if lvl == "warning")
        self.assertIn("admin_token", warns)
        self.assertIn("No email sender", warns)

    def test_no_recipient_is_an_error(self):
        self.assertTrue(any("send_leads_to" in e for e in self.errors(load("keys: {openrouter: x, huggingface: y}"))))

    def test_mock_mode_skips_provider_checks(self):
        self.assertEqual(self.errors(load("server: {mock_mode: true}")), [])

    def test_check_config_script(self):
        d = Path(tempfile.mkdtemp())
        bad, good = d / "bad.yaml", d / "good.yaml"
        bad.write_text("llm: {provider: groq}\nemail: {send_leads_to: a@b.co}")
        good.write_text("keys: {openrouter: x, huggingface: y}\nemail: {send_leads_to: a@b.co}\nserver: {admin_token: a-long-random-token}")
        env = {k: v for k, v in os.environ.items() if not k.endswith(("_API_KEY", "HF_TOKEN"))}
        env["VSA_NO_DOTENV"] = "1"
        run_ = lambda p: subprocess.run([sys.executable, str(ROOT / "scripts" / "check_config.py"), str(p)], capture_output=True, text=True, env=env, cwd=ROOT)
        r = run_(bad)
        self.assertEqual(r.returncode, 1)
        self.assertIn("keys.groq", r.stdout)
        self.assertIn("NOT READY", r.stdout)
        r = run_(good)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("READY", r.stdout)


class TwilioCredentialTests(unittest.TestCase):
    """The .env may carry an account SID + auth token, or an API key SID + secret."""

    def load_env(self, **env):
        with mock.patch.dict(os.environ, {**CLEAN_ENV, **env}, clear=True):
            return Settings.load(ROOT / "agent.yaml")

    def test_api_key_sid_never_lands_in_the_auth_token_slot(self):
        s = self.load_env(Twilio_sid="SK" + "a" * 32, Twilio_secret="sec")
        self.assertEqual((s.twilio_api_key_sid, s.twilio_api_key_secret), ("SK" + "a" * 32, "sec"))
        self.assertEqual(s.twilio_auth_token, "")

    def test_account_sid_goes_in_the_account_slot(self):
        s = self.load_env(Twilio_sid="AC" + "a" * 32, Twilio_secret="tok")
        self.assertEqual((s.twilio_account_sid, s.twilio_auth_token), ("AC" + "a" * 32, "tok"))
        self.assertEqual(s.twilio_api_key_sid, "")

    def test_explicit_vars_win_over_legacy_names(self):
        s = self.load_env(Twilio_sid="SK" + "a" * 32, Twilio_secret="sec",
                          TWILIO_ACCOUNT_SID="AC" + "b" * 32, TWILIO_AUTH_TOKEN="real-token")
        self.assertEqual((s.twilio_account_sid, s.twilio_auth_token), ("AC" + "b" * 32, "real-token"))
        self.assertEqual((s.twilio_api_key_sid, s.twilio_api_key_secret), ("SK" + "a" * 32, "sec"))
        self.assertEqual(s.twilio_signing_token, "real-token")

    def test_signing_token_falls_back_to_the_key_secret(self):
        s = self.load_env(Twilio_sid="SK" + "a" * 32, Twilio_secret="sec")
        self.assertEqual(s.twilio_signing_token, "sec")

    def test_phone_number_accepts_either_casing(self):
        self.assertEqual(self.load_env(Twilio_phone_number="+441349800007").twilio_phone_number, "+441349800007")
        self.assertEqual(self.load_env(TWILIO_PHONE_NUMBER="+441349800007").twilio_phone_number, "+441349800007")


class BuildProvidersTests(unittest.TestCase):
    def test_each_choice_builds_the_right_client(self):
        s = load("keys: {groq: g, elevenlabs: e, openai: o, openrouter: r, huggingface: h}\nllm: {provider: groq}\nvoice: {provider: elevenlabs}\nlistening: {provider: groq}")
        p = build_providers(s)
        self.assertIsInstance(p.llm, OpenAICompatLLM)
        self.assertIsInstance(p.tts, ElevenLabsTTS)
        self.assertIsInstance(p.stt, OpenAICompatSTT)
        p = build_providers(load("keys: {openrouter: r, huggingface: h}"))
        self.assertIsInstance(p.tts, OpenAICompatTTS)
        self.assertIsInstance(p.stt, HFWhisperSTT)
        self.assertEqual(p.tts.model, "fish-audio/s2.1-pro-free")

    def test_unknown_provider_raises_clear_error(self):
        with self.assertRaises(ConfigError):
            build_providers(load("voice: {provider: nope}\nkeys: {openrouter: r}"))

    def test_mock_mode(self):
        self.assertIsInstance(build_providers(load("server: {mock_mode: true}")).llm, MockLLM)


class SwitchedProvidersTalkToTheRightServers(unittest.TestCase):
    """Edit only provider/model/key and the requests change accordingly."""

    @classmethod
    def setUpClass(cls):
        cls.svc = FakeServices()

    @classmethod
    def tearDownClass(cls):
        cls.svc.stop()

    def setUp(self):
        self.svc.requests.clear()
        self.svc.tts_status = 200
        self.svc.llm_fail_models.clear()
        self.svc.llm_reply = "hello there"

    def test_elevenlabs_request_shape(self):
        tts = ElevenLabsTTS(self.svc.url, "el_key", "eleven_turbo_v2_5", "voice-1")
        pcm = run(tts.synth("Hi caller"))
        req = self.svc.find("/v1/text-to-speech/voice-1")[0]
        self.assertEqual(req["headers"]["xi-api-key"], "el_key")
        self.assertEqual(req["json"], {"text": "Hi caller", "model_id": "eleven_turbo_v2_5"})
        self.assertIn("output_format=mp3", req["query"])
        self.assertAlmostEqual(len(pcm) / 24000, 1.0, delta=0.15)

    def test_openai_tts_preset_sends_alloy_voice(self):
        s = load("keys: {openai: oa}\nvoice: {provider: openai, base_url: '%s/oa'}" % self.svc.url)
        run(build_providers(s).tts.synth("Hi"))
        req = self.svc.find("/oa/audio/speech")[0]
        self.assertEqual(req["json"], {"model": "gpt-4o-mini-tts", "input": "Hi", "response_format": "mp3", "voice": "alloy"})
        self.assertEqual(req["headers"]["authorization"], "Bearer oa")

    def test_groq_style_stt_multipart(self):
        s = load("keys: {groq: gk}\nlistening: {provider: groq, base_url: '%s/groq/openai/v1'}" % self.svc.url)
        text = run(build_providers(s).stt.transcribe(b"\x01\x00" * 1600, 16000))
        req = self.svc.find("/groq/openai/v1/audio/transcriptions")[0]
        self.assertEqual(text, "fish heard this")
        self.assertEqual(req["headers"]["authorization"], "Bearer gk")
        self.assertIn(b"whisper-large-v3-turbo", req["raw"])

    def test_llm_on_custom_server_without_key_sends_no_auth_header(self):
        s = load("llm: {provider: ollama, base_url: '%s/local/v1'}\nkeys: {}" % self.svc.url)
        self.assertEqual(s.llm_api_key, "")
        self.assertEqual(run(build_providers(s).llm.complete([{"role": "user", "content": "q"}])), "hello there")
        req = self.svc.find("/local/v1/chat/completions")[0]
        self.assertNotIn("authorization", req["headers"])
        self.assertEqual(req["json"]["model"], "llama3.1")

    def test_llm_switch_to_openai_hits_that_base_url_with_that_key(self):
        s = load("keys: {openai: oa_key}\nllm: {provider: openai, base_url: '%s/oai/v1', model: gpt-test}" % self.svc.url)
        run(build_providers(s).llm.complete([{"role": "user", "content": "q"}]))
        req = self.svc.find("/oai/v1/chat/completions")[0]
        self.assertEqual((req["headers"]["authorization"], req["json"]["model"]), ("Bearer oa_key", "gpt-test"))
        self.assertNotIn("http-referer", req["headers"])  # only OpenRouter gets referer headers


class EmailTests(unittest.TestCase):
    REC = {"channel": "phone", "caller": "+1555", "duration": 5, "end_reason": "x", "company": "Co",
           "transcript": [{"role": "user", "text": "hi"}],
           "lead": {"name": "Ann", "email": "ann@example.com", "outcome": "lead", "summary": "s"}}

    def test_gmail_app_password_with_spaces_and_no_username(self):
        """Exactly the shape of the uploaded .env: app password with spaces, SMTP_USER empty."""
        s = load("", {"SMTP_PASS": "abcd efgh ijkl mnop", "LEAD_EMAIL_TO": "boss@gmail.com"})
        self.assertEqual(s.smtp_pass, "abcdefghijklmnop")
        self.assertEqual(s.smtp_login, "boss@gmail.com")
        self.assertTrue(s.smtp_configured)
        self.assertEqual(Notifier(s).order(), ["smtp"])
        self.assertEqual(Notifier(s).build_message(self.REC)["From"], "boss@gmail.com")

    def test_explicit_smtp_user_wins_and_other_hosts_are_untouched(self):
        s = load("", {"SMTP_PASS": "a b", "SMTP_USER": "me@gmail.com", "LEAD_EMAIL_TO": "boss@gmail.com"})
        self.assertEqual(s.smtp_login, "me@gmail.com")
        other = load("", {"SMTP_PASS": "a b", "SMTP_HOST": "smtp.example.com", "LEAD_EMAIL_TO": "boss@x.com"})
        self.assertEqual((other.smtp_pass, other.smtp_login, other.smtp_configured), ("a b", "", False))

    def test_first_working_method_wins_without_duplicates(self):
        svc, sink = FakeServices(), SMTPSink()
        try:
            s = base_settings(tmpdir(), svc, sink, n8n_webhook_url=svc.url + "/n8n", resend_api_key="re_key")
            status = Notifier(s).send(self.REC)
            sink.wait_for(1)
            time_ok = (status, len(sink.messages), len(svc.find("/n8n")), len(svc.find("/resend/emails")))
        finally:
            svc.stop()
            sink.stop()
        self.assertEqual(time_ok, ({"smtp": "sent"}, 1, 0, 0))

    def test_falls_through_smtp_to_resend_to_n8n_to_outbox(self):
        svc = FakeServices()
        try:
            dead = dict(smtp_host="127.0.0.1", smtp_port=1, smtp_security="none")
            s = base_settings(tmpdir(), svc, n8n_webhook_url=svc.url + "/n8n", resend_api_key="re_key", **dead)
            st = Notifier(s).send(self.REC)
            self.assertTrue(st["smtp"].startswith("failed"))
            self.assertEqual(st["resend"], "sent")
            self.assertNotIn("n8n", st)
            svc.resend_status = 500
            st = Notifier(s).send(self.REC)
            self.assertEqual((st["resend"][:6], st["n8n"]), ("failed", "sent"))
            s2 = base_settings(tmpdir(), svc, n8n_webhook_url=svc.url + "/missing", resend_api_key="re_key", **dead)
            st = Notifier(s2).send(self.REC)
            self.assertIn("outbox", st)
            self.assertTrue(Path(st["outbox"]).exists())
        finally:
            svc.stop()

    def test_resend_request_shape(self):
        svc = FakeServices()
        try:
            s = base_settings(tmpdir(), svc, resend_api_key="re_key", lead_email_to="boss@example.com")
            Notifier(s).send(self.REC)
            req = svc.find("/resend/emails")[0]
        finally:
            svc.stop()
        self.assertEqual(req["headers"]["authorization"], "Bearer re_key")
        self.assertEqual(req["json"]["to"], ["boss@example.com"])
        self.assertEqual(req["json"]["from"], "Voice Agent <onboarding@resend.dev>")
        self.assertIn("ann@example.com", req["json"]["html"])
        self.assertIn("New lead: Ann", req["json"]["subject"])

    def test_method_preference_reorders(self):
        svc = FakeServices()
        try:
            s = base_settings(tmpdir(), svc, n8n_webhook_url=svc.url + "/n8n", resend_api_key="re_key", email_method="n8n",
                              smtp_user="u", smtp_pass="p")
            self.assertEqual(Notifier(s).order(), ["n8n", "smtp", "resend"])
        finally:
            svc.stop()


class ShippedProjectTests(unittest.TestCase):
    def test_uploaded_env_is_installed_and_consistent(self):
        env_path = ROOT / ".env"
        if not env_path.exists():
            self.skipTest("no .env in this copy")
        vals = {k: v for k, v in dotenv_values(env_path).items() if v}
        with mock.patch.dict(os.environ, {**CLEAN_ENV, **vals}, clear=True):
            s = Settings.load(ROOT / "agent.yaml")
        self.assertTrue(s.telnyx_api_key.startswith("KEY"))
        self.assertEqual(s.telnyx_phone_number, "+15519007793")
        self.assertTrue(s.llm_api_key.startswith("sk-or-"))
        self.assertEqual((s.stt_provider, s.stt_base_url), ("custom", "http://localhost:8788/v1"))
        self.assertEqual(s.stt_api_key, "")  # local whisper server needs no key
        self.assertNotIn(" ", s.smtp_pass)
        self.assertEqual(len(s.smtp_pass), 16)
        self.assertEqual(s.smtp_login, s.lead_email_to)
        self.assertEqual([m for lvl, m in problems(s) if lvl == "error"], [])
        self.assertEqual(Notifier(s).order(), ["smtp"])

    def test_buyer_kit_has_no_secrets_and_is_valid(self):
        d = Path(tempfile.mkdtemp())
        sys.path.insert(0, str(ROOT / "scripts"))
        try:
            import make_buyer_kit
            src = d / "agent.yaml"
            src.write_text((ROOT / "agent.yaml").read_text().replace('openrouter: ""', 'openrouter: "sk-or-SECRET"')
                           .replace('number: "+15519007793"', 'number: "+15519007793"')
                           .replace('smtp_password: ""', 'smtp_password: "pw SECRET"')
                           .replace('send_leads_to: ""', 'send_leads_to: "me@example.com"'))
            dest = make_buyer_kit.make(src, d / "kit")
        finally:
            sys.path.pop(0)
        text = dest.read_text()
        for secret in ("SECRET", "+15519007793", "me@example.com"):
            self.assertNotIn(secret, text)
        data = yaml.safe_load(text)
        self.assertEqual(data["keys"]["openrouter"], "")
        self.assertEqual(data["business"]["company"], "Sunrise Solar")
        self.assertEqual(data["llm"]["provider"], "openrouter")

    def test_release_zip_has_no_secrets_and_a_blank_agent_yaml(self):
        import zipfile
        sys.path.insert(0, str(ROOT / "scripts"))
        try:
            import make_release
            zpath, ypath = make_release.build(Path(tempfile.mkdtemp()))
        finally:
            sys.path.pop(0)
        with zipfile.ZipFile(zpath) as z:
            names = z.namelist()
            blob = b"".join(z.read(n) for n in names if not n.endswith((".mp3", ".png", ".gif", ".jpg", ".ico", ".webp")))
        self.assertNotIn("voice-sales-agent/.env", names)
        self.assertFalse([n for n in names if "/vendor/" in n or "/data/outbox" in n or n.endswith(".db")])
        self.assertEqual(find_secrets(blob), [])
        for must in ("voice-sales-agent/agent.yaml", "voice-sales-agent/app/main.py", "voice-sales-agent/web/widget.js",
                     "voice-sales-agent/BUYER_GUIDE.md", "voice-sales-agent/scripts/check_config.py"):
            self.assertIn(must, names)
        data = yaml.safe_load(ypath.read_text())
        self.assertTrue(all(v == "" for v in data["keys"].values()))
        self.assertEqual(data["phone"]["number"], "")


if __name__ == "__main__":
    unittest.main()
