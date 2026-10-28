import asyncio
import base64
import json
import threading
import time
import unittest

import numpy as np
from starlette.testclient import TestClient

from app.audio import ulaw_decode, ulaw_encode
from app.main import create_app
from app.providers import MockLLM, MockSTT, MockTTS, Providers, build_providers
from app.s2s import S2SSession
from app.session import VoiceSession
from app.prompt import load_business
from app.config import ROOT

from .fakes import FakeServices, SMTPSink, base_settings, message_text, tmpdir


def tone(sec, amp=6000, rate=8000):
    t = np.arange(int(rate * sec)) / rate
    return (amp * np.sin(2 * np.pi * 300 * t)).astype(np.int16)


def silence(sec, rate=8000):
    return np.zeros(int(rate * sec), dtype=np.int16)


class PhoneCall:
    """Drives the real /telnyx/media websocket like Telnyx would, and collects what the server sends back."""

    def __init__(self, client, token, cc="cc-test", caller="+15550001111"):
        self.ws = client.websocket_connect(f"/telnyx/media?token={token}").__enter__()
        self.out: list[dict] = []
        self._t = threading.Thread(target=self._reader, daemon=True)
        self._t.start()
        self.ws.send_text(json.dumps({"event": "connected", "version": "1.0.0"}))
        self.ws.send_text(json.dumps({"event": "start", "stream_id": "s1", "start": {
            "call_control_id": cc, "from": caller, "to": "+15519007793",
            "media_format": {"encoding": "PCMU", "sample_rate": 8000, "channels": 1}}}))

    def _reader(self):
        try:
            while True:
                self.out.append(json.loads(self.ws.receive_text()))
        except Exception:  # noqa: BLE001 - closed
            pass

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

    def wait(self, cond, timeout=6.0):
        end = time.time() + timeout
        while time.time() < end and not cond():
            time.sleep(0.05)
        return cond()


def mock_providers(stt=None, replies=None):
    return Providers(MockSTT(stt or ["hello there", "my email is a@b.com"]), MockLLM(replies or ["Hi! How can I help? ", "Sure thing. Goodbye! [[END_CALL]]"]), MockTTS())


class PhoneFlowTests(unittest.TestCase):
    def test_full_call_greets_answers_hangs_up_and_stores_lead(self):
        svc, sink = FakeServices(), SMTPSink()
        try:
            s = base_settings(tmpdir(), svc, sink)
            app = create_app(s, mock_providers(["I want family solar, my email is junaidalani2001@gmail.com", "ok goodbye"],
                                               ["Great. Anything else?", "Perfect, thanks for calling. Goodbye! [[END_CALL]]"]))
            with TestClient(app) as c:
                call = PhoneCall(c, s.ws_secret)
                self.assertTrue(call.wait(lambda: len(call.audio_bytes()) > 8000), "greeting audio not received")
                call.turn()
                call.turn()
                self.assertTrue(call.wait(lambda: svc.find("/telnyx/calls/cc-test/actions/hangup")), "agent did not hang up")
                call.hangup()
                msgs = sink.wait_for(1)
                calls = c.get("/api/calls", headers={"authorization": "Bearer adm"}).json()["calls"]
        finally:
            svc.stop()
            sink.stop()
        # audio sent to the caller is valid mu-law of sensible size
        pcm = ulaw_decode(call.audio_bytes())
        self.assertGreater(len(pcm) / 8000, 3.0)
        self.assertGreater(int(np.abs(pcm).max()), 1000)
        # conversation
        rec = calls[0]
        roles = [t["role"] for t in rec["transcript"]]
        self.assertEqual(roles, ["assistant", "user", "assistant", "user", "assistant"])
        self.assertNotIn("END_CALL", json.dumps(rec["transcript"]))
        self.assertEqual(rec["end_reason"], "agent_ended")
        self.assertEqual(rec["caller"], "+15550001111")
        self.assertEqual(rec["lead"]["email"], "junaidalani2001@gmail.com")
        # email
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0]["To"], "junaidalani2001@gmail.com")
        self.assertIn("junaidalani2001@gmail.com", message_text(msgs[0]))
        self.assertEqual(rec["notify"], {"smtp": "sent"})

    def test_barge_in_clears_agent_audio(self):
        app = create_app(base_settings(tmpdir()), mock_providers())
        s = app.state.ctx.settings
        with TestClient(app) as c:
            call = PhoneCall(c, s.ws_secret)
            self.assertTrue(call.wait(lambda: len(call.audio_bytes()) > 1600))  # greeting is playing
            call.speak(tone(1.0))  # caller talks over the greeting
            self.assertTrue(call.wait(lambda: any(m.get("event") == "clear" for m in call.out)), "no barge-in clear sent")
            call.hangup()

    def test_silent_call_is_stored_but_not_emailed(self):
        sink = SMTPSink()
        try:
            s = base_settings(tmpdir(), sink=sink)
            app = create_app(s, mock_providers())
            with TestClient(app) as c:
                call = PhoneCall(c, s.ws_secret)
                call.wait(lambda: len(call.audio_bytes()) > 1600)
                call.hangup()
                calls = []
                for _ in range(60):
                    calls = c.get("/api/calls?token=adm").json()["calls"]
                    if calls:
                        break
                    time.sleep(0.1)
            time.sleep(0.3)
            self.assertEqual(len(sink.messages), 0)
        finally:
            sink.stop()
        self.assertEqual(calls[0]["notify"], {"skipped": "no caller speech"})
        self.assertEqual(calls[0]["lead"]["outcome"], "no_action")

    def test_llm_outage_falls_back_politely_and_hangs_up(self):
        svc = FakeServices()
        svc.llm_fail_models.update({"primary/model", "backup/model"})
        try:
            s = base_settings(tmpdir(), svc)
            app = create_app(s, Providers(MockSTT(["hello", "hello again"]), build_providers(s).llm, MockTTS()))
            with TestClient(app) as c:
                call = PhoneCall(c, s.ws_secret, cc="cc-err")
                call.wait(lambda: len(call.audio_bytes()) > 1600)
                call.turn()
                call.turn()
                self.assertTrue(call.wait(lambda: svc.find("/telnyx/calls/cc-err/actions/hangup")), "no hangup after repeated failure")
                call.hangup()
        finally:
            svc.stop()


class EndToEndWithFakeServices(unittest.TestCase):
    """Real STT/LLM/TTS provider classes -> local fake OpenRouter / Hugging Face; real SMTP; real Telnyx REST client."""

    def test_end_to_end(self):
        svc, sink = FakeServices(), SMTPSink()
        svc.stt_texts = ["Hi I want a family solar quote, my name is Junaid Alani", "My email is junaidalani2001 at gmail dot com thanks bye"]
        svc.llm_reply = "Wonderful, a consultant will call you. Goodbye! [[END_CALL]]"
        try:
            s = base_settings(tmpdir(), svc, sink, mock_mode=False)
            app = create_app(s)  # builds REAL providers from settings
            with TestClient(app) as c:
                call = PhoneCall(c, s.ws_secret, cc="cc-e2e")
                self.assertTrue(call.wait(lambda: len(call.audio_bytes()) > 8000, 10), "no greeting audio")
                call.turn()
                self.assertTrue(call.wait(lambda: svc.find("/telnyx/calls/cc-e2e/actions/hangup"), 15), "agent never hung up")
                call.hangup()
                msgs = sink.wait_for(1, 15)
                calls = c.get("/api/calls?token=adm").json()["calls"]
        finally:
            svc.stop()
            sink.stop()

        # STT got a real WAV from the caller's speech
        stt = svc.find("/hf/openai/whisper-large-v3-turbo")
        self.assertTrue(stt)
        self.assertEqual(stt[0]["raw"][:4], b"RIFF")
        self.assertEqual(stt[0]["headers"]["authorization"], "Bearer hf-key")
        # LLM saw the business prompt and the caller's words
        chat = [r for r in svc.find("/or/chat/completions") if r["json"].get("stream")]
        self.assertTrue(chat)
        msgs_sent = chat[0]["json"]["messages"]
        self.assertIn("Sunrise Solar", msgs_sent[0]["content"])
        self.assertEqual(msgs_sent[-1], {"role": "user", "content": "Hi I want a family solar quote, my name is Junaid Alani"})
        # TTS used Fish Audio S2.1 Pro (free) on OpenRouter, once for the greeting and once per reply sentence
        tts = svc.find("/or/audio/speech")
        self.assertGreaterEqual(len(tts), 2)
        self.assertTrue(all(r["json"]["model"] == "fish-audio/s2.1-pro-free" for r in tts))
        self.assertTrue(all(r["headers"]["authorization"] == "Bearer or-key" for r in tts))
        self.assertIn("Thanks for calling Sunrise Solar", tts[0]["json"]["input"])
        self.assertNotIn("END_CALL", " ".join(r["json"]["input"] for r in tts))
        # audio back to the caller is decoded Fish audio re-encoded as mu-law 8 kHz
        pcm = ulaw_decode(call.audio_bytes())
        self.assertGreater(len(pcm) / 8000, 2.5)
        self.assertGreater(int(np.abs(pcm).max()), 1500)
        # lead extracted, stored, emailed to the Gmail address
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0]["To"], "junaidalani2001@gmail.com")
        body = message_text(msgs[0])
        self.assertIn("Junaid Alani", body)
        self.assertIn("junaidalani2001@gmail.com", body)
        self.assertIn("Wonderful, a consultant will call you.", body)
        self.assertEqual(calls[0]["outcome"], "lead")


class WebChannelTests(unittest.TestCase):
    def test_text_chat_over_websocket_and_lead_email(self):
        sink = SMTPSink()
        try:
            s = base_settings(tmpdir(), sink=sink)
            app = create_app(s, mock_providers(replies=["Our Family plan is great. May I have your email?", "Thanks, bye! [[END_CALL]]"]))
            events, audio = [], bytearray()
            with TestClient(app) as c:
                with c.websocket_connect("/web/ws?voice=0&page=https://site.test/pricing") as ws:
                    ready = json.loads(ws.receive_text())
                    self.assertEqual((ready["type"], ready["audio"]["rate"]), ("ready", 24000))
                    greet = json.loads(ws.receive_text())
                    self.assertEqual((greet["role"], greet["type"]), ("assistant", "transcript"))
                    ws.send_text(json.dumps({"type": "text", "text": "Tell me about the family plan, I'm bob@example.com"}))
                    seen = []
                    for _ in range(10):
                        m = json.loads(ws.receive_text())
                        seen.append(m)
                        if m.get("role") == "assistant" and "Family plan" in m.get("text", ""):
                            break
                    ws.send_text(json.dumps({"type": "end"}))
                msgs = sink.wait_for(1)
        finally:
            sink.stop()
        self.assertTrue(any(m.get("role") == "user" for m in seen))
        self.assertEqual(len(msgs), 1)
        self.assertIn("web", message_text(msgs[0]))
        self.assertIn("bob@example.com", message_text(msgs[0]))

    def test_web_voice_audio_is_pcm16_24k(self):
        app = create_app(base_settings(tmpdir()), mock_providers())
        with TestClient(app) as c, c.websocket_connect("/web/ws") as ws:
            json.loads(ws.receive_text())  # ready
            got = b""
            for _ in range(40):
                m = ws.receive()
                if m.get("bytes"):
                    got += m["bytes"]
                if len(got) > 24000 * 2:
                    break
            ws.send_text(json.dumps({"type": "end"}))
        self.assertGreater(len(got), 24000 * 2)  # > 1 second of 24 kHz int16 audio

    def test_origin_allowlist(self):
        from starlette.websockets import WebSocketDisconnect
        app = create_app(base_settings(tmpdir(), allowed_origins=["https://mysite.com"]), mock_providers())
        with TestClient(app) as c:
            with self.assertRaises(WebSocketDisconnect):
                with c.websocket_connect("/web/ws", headers={"origin": "https://evil.com"}):
                    pass
            with c.websocket_connect("/web/ws?voice=0", headers={"origin": "https://mysite.com"}) as ws:
                self.assertEqual(json.loads(ws.receive_text())["type"], "ready")


class RestApiTests(unittest.TestCase):
    def setUp(self):
        self.svc = FakeServices()
        self.sink = SMTPSink()
        self.s = base_settings(tmpdir(), self.svc, self.sink)
        self.app = create_app(self.s, mock_providers())

    def tearDown(self):
        self.svc.stop()
        self.sink.stop()

    def test_lead_form_emails_and_validates(self):
        with TestClient(self.app) as c:
            r = c.post("/api/lead", json={"name": "Ann", "email": "ann@example.com", "message": "Call me", "interest": "battery"})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(c.post("/api/lead", json={"email": "bad"}).status_code, 400)
            self.assertEqual(c.post("/api/lead", json={"name": "x"}).status_code, 400)
            self.assertTrue(c.post("/api/lead", json={"email": "a@b.co", "website": "spam"}).json()["ok"])  # honeypot
            msgs = self.sink.wait_for(1)
            time.sleep(0.3)
        self.assertEqual(len(self.sink.messages), 1)  # honeypot sent nothing
        self.assertIn("ann@example.com", message_text(msgs[0]))

    def test_lead_form_rate_limit(self):
        with TestClient(self.app) as c:
            codes = [c.post("/api/lead", json={"email": f"u{i}@example.com"}).status_code for i in range(12)]
        self.assertEqual(codes.count(429), 2)

    def test_admin_auth(self):
        with TestClient(self.app) as c:
            self.assertEqual(c.get("/api/calls").status_code, 401)
            self.assertEqual(c.get("/api/calls", headers={"authorization": "Bearer nope"}).status_code, 401)
            self.assertEqual(c.get("/api/calls?token=adm").status_code, 200)
            self.assertEqual(c.post("/api/outbound", json={"to": "+15551234567"}).status_code, 401)

    def test_outbound_call_dials_via_telnyx(self):
        with TestClient(self.app) as c:
            h = {"authorization": "Bearer adm"}
            self.assertEqual(c.post("/api/outbound", json={"to": "5551234"}, headers=h).status_code, 400)
            r = c.post("/api/outbound", json={"to": "+15551234567"}, headers=h)
        self.assertEqual(r.status_code, 200)
        dial = self.svc.find("/telnyx/calls")[0]["json"]
        self.assertEqual((dial["to"], dial["from"], dial["connection_id"], dial["webhook_url"]),
                         ("+15551234567", "+15519007793", "app-1", "https://agent.test/telnyx/webhook"))

    def test_health_and_public_config(self):
        with TestClient(self.app) as c:
            self.assertTrue(c.get("/health").json()["ok"])
            self.assertEqual(c.get("/api/config").json()["company"], "Sunrise Solar")
            for path in ("/", "/widget.js", "/admin"):
                self.assertEqual(c.get(path).status_code, 200, path)


class S2SEngineTests(unittest.IsolatedAsyncioTestCase):
    async def test_bridges_audio_both_ways_and_barge_in(self):
        sent, replies = [], asyncio.Queue()

        class FakeWS:
            async def send(self, data):
                sent.append(json.loads(data))

            def __aiter__(self):
                return self

            async def __anext__(self):
                item = await replies.get()
                if item is None:
                    raise StopAsyncIteration
                return json.dumps(item)

            async def close(self):
                replies.put_nowait(None)

        async def connect(url):
            self.assertEqual(url, "ws://localhost:8765/v1/realtime")
            return FakeWS()

        class T:
            out_rate = 8000
            def __init__(self): self.audio, self.cleared = b"", 0
            async def send_audio(self, b): self.audio += b
            async def clear(self): self.cleared += 1
            async def send_event(self, e): pass
            async def hangup(self): pass

        done = []
        t = T()
        s = base_settings(tmpdir())
        sess = S2SSession(settings=s, transport=t, business=load_business(ROOT / "config" / "business.yaml"),
                          channel="phone", meta={"from": "+1555"}, connect=connect,
                          on_finish=lambda r: asyncio.sleep(0, result=done.append(r)))
        await sess.start()
        self.assertEqual(sent[0]["type"], "session.update")
        self.assertIn("Sunrise Solar", sent[0]["session"]["instructions"])
        self.assertEqual(sent[0]["session"]["audio"]["input"]["turn_detection"]["interrupt_response"], True)
        await sess.feed_pcm16k((tone(0.1, rate=16000)).astype("<i2").tobytes())
        append = [m for m in sent if m["type"] == "input_audio_buffer.append"][0]
        self.assertEqual(len(base64.b64decode(append["audio"])), int(24000 * 0.1) * 2)  # resampled 16k -> 24k
        out24 = (tone(0.5, rate=24000)).astype("<i2").tobytes()
        replies.put_nowait({"type": "response.output_audio.delta", "delta": base64.b64encode(out24).decode()})
        replies.put_nowait({"type": "input_audio_buffer.speech_started"})
        replies.put_nowait({"type": "conversation.item.input_audio_transcription.completed", "transcript": "hello"})
        replies.put_nowait({"type": "response.output_audio_transcript.done", "transcript": "Hi there"})
        for _ in range(50):
            if t.cleared and len(sess.transcript) == 2:
                break
            await asyncio.sleep(0.02)
        self.assertEqual(len(t.audio), int(8000 * 0.5) * 2)  # resampled 24k -> 8k
        self.assertEqual(t.cleared, 1)
        await sess.close("test")
        self.assertEqual([x["role"] for x in done[0]["transcript"]], ["user", "assistant"])


if __name__ == "__main__":
    unittest.main()
