import asyncio
import unittest

import numpy as np

from app.audio import (VAD, Up2, decode_with_ffmpeg, normalize_spoken_email, pcm_array, resample, to_wav, ulaw_decode,
                       ulaw_encode)
from app.prompt import END_MARKER_RE, build_system_prompt, load_business, parse_json_object
from app.providers import (CANONICAL_TTS_RATE, FishCompatSTT, HFWhisperSTT, OpenAICompatTTS, OpenRouterLLM, ProviderError)
from app.session import split_sentences
from app.config import ROOT

from .fakes import FakeServices, base_settings, make_mp3, tmpdir


def run(coro):
    return asyncio.run(coro)


class AudioTests(unittest.TestCase):
    def test_ulaw_roundtrip_is_accurate(self):
        t = np.arange(8000) / 8000
        x = (8000 * np.sin(2 * np.pi * 440 * t)).astype(np.int16)
        y = ulaw_decode(ulaw_encode(x))
        self.assertEqual(len(ulaw_encode(x)), 8000)
        self.assertLess(np.abs(x.astype(int) - y.astype(int)).max(), 0.03 * 8000)

    def test_ulaw_known_values(self):
        self.assertEqual(ulaw_encode(np.array([0], dtype=np.int16)), b"\xff")
        self.assertEqual(int(ulaw_decode(b"\xff")[0]), 0)

    def test_resample_lengths(self):
        x = np.zeros(2400, dtype=np.int16)
        self.assertEqual(len(resample(x, 24000, 8000)), 800)
        self.assertEqual(len(resample(x, 24000, 16000)), 1600)
        self.assertEqual(len(Up2().process(np.zeros(160, dtype=np.int16))), 320)

    def test_vad_segments_one_utterance(self):
        rate = 16000
        sil = (np.random.randint(-30, 30, rate)).astype(np.int16)
        tone = (5000 * np.sin(2 * np.pi * 300 * np.arange(rate) / rate)).astype(np.int16)
        v, ev = VAD(), []
        for chunk in (sil, tone, sil, sil):
            b = chunk.tobytes()
            for i in range(0, len(b), 640):
                ev += v.feed(b[i:i + 640])
        kinds = [k for k, _ in ev]
        self.assertEqual(kinds, ["start", "end"])
        self.assertGreater(len(ev[1][1]) / 32000, 1.0)

    def test_vad_ignores_blip_and_noise(self):
        rate = 16000
        noise = np.random.randint(-100, 100, rate * 2).astype(np.int16)
        blip = (6000 * np.sin(2 * np.pi * 300 * np.arange(1600) / rate)).astype(np.int16)  # 100ms
        v, ev = VAD(), []
        for chunk in (noise, blip, np.zeros(rate, dtype=np.int16)):
            b = chunk.tobytes()
            for i in range(0, len(b), 640):
                ev += v.feed(b[i:i + 640])
        self.assertNotIn("end", [k for k, _ in ev])

    def test_ffmpeg_mp3_decode(self):
        pcm = decode_with_ffmpeg(make_mp3(1.0), CANONICAL_TTS_RATE)
        self.assertAlmostEqual(len(pcm) / CANONICAL_TTS_RATE, 1.0, delta=0.15)
        self.assertGreater(int(np.abs(pcm).max()), 1000)

    def test_wav_header(self):
        self.assertEqual(to_wav(b"\x00\x00" * 160, 16000)[:4], b"RIFF")

    def test_spoken_email(self):
        self.assertEqual(normalize_spoken_email("junaid dot ali at gmail dot com"), "junaid.ali@gmail.com")
        self.assertEqual(normalize_spoken_email("it is junaidalani2001@gmail.com thanks"), "junaidalani2001@gmail.com")
        self.assertIsNone(normalize_spoken_email("no email here"))

    def test_sentence_splitter(self):
        out, rest = split_sentences("Hello there. It costs $4.99 today! Are you")
        self.assertEqual(out, ["Hello there.", "It costs $4.99 today!"])
        self.assertEqual(rest, "Are you")
        out, rest = split_sentences("Goodbye! [[END_CALL]]")
        self.assertEqual((out, rest), (["Goodbye!"], "[[END_CALL]]"))
        self.assertTrue(END_MARKER_RE.search("bye [[ END_CALL ]]"))

    def test_prompt_contains_business_facts(self):
        biz = load_business(ROOT / "config" / "business.yaml")
        p = build_system_prompt(biz, "phone", {"from": "+15550001111"})
        for needle in ("Sunrise Solar", "Family Solar", "17,500", "[[END_CALL]]", "+15550001111", "ONE question"):
            self.assertIn(needle, p)
        self.assertEqual(parse_json_object('```json\n{"a": 1}\n```'), {"a": 1})
        self.assertEqual(parse_json_object('Sure! {"a": 2} done'), {"a": 2})
        self.assertIsNone(parse_json_object("nope"))


class ProviderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.svc = FakeServices()
        cls.s = base_settings(tmpdir(), cls.svc)

    @classmethod
    def tearDownClass(cls):
        cls.svc.stop()

    def setUp(self):
        self.svc.requests.clear()
        self.svc.llm_fail_models.clear()
        self.svc.tts_status = 200

    def test_tts_openrouter_request_shape_and_mp3_decode(self):
        tts = OpenAICompatTTS(self.s.openrouter_base_url, "or-key", "fish-audio/s2.1-pro-free", "voice123", "mp3", 44100)
        pcm = run(tts.synth("Hello caller."))
        req = self.svc.find("/or/audio/speech")[0]
        self.assertEqual(req["headers"]["authorization"], "Bearer or-key")
        self.assertEqual(req["json"], {"model": "fish-audio/s2.1-pro-free", "input": "Hello caller.",
                                       "response_format": "mp3", "voice": "voice123"})
        self.assertAlmostEqual(len(pcm) / CANONICAL_TTS_RATE, 1.0, delta=0.15)

    def test_tts_pcm_path_resamples_to_24k(self):
        tts = OpenAICompatTTS(self.s.openrouter_base_url, "or-key", "m", "", "pcm", 44100)
        pcm = run(tts.synth("x"))
        self.assertNotIn("voice", self.svc.find("/or/audio/speech")[0]["json"])
        self.assertAlmostEqual(len(pcm) / CANONICAL_TTS_RATE, 1.0, delta=0.02)

    def test_tts_error_is_reported_without_key(self):
        self.svc.tts_status = 400
        tts = OpenAICompatTTS(self.s.openrouter_base_url, "or-key", "m", "", "mp3", 44100)
        with self.assertRaises(ProviderError) as cm:
            run(tts.synth("x"))
        self.assertIn("400", str(cm.exception))
        self.assertNotIn("or-key", str(cm.exception))

    def test_fish_direct_uses_fish_model_and_key(self):
        tts = OpenAICompatTTS(self.s.fish_base_url, "fish-key", "fish-audio/s2.1-pro", "", "mp3", 44100)
        run(tts.synth("hi"))
        req = self.svc.find("/fish/audio/speech")[0]
        self.assertEqual(req["headers"]["authorization"], "Bearer fish-key")
        self.assertEqual(req["json"]["model"], "fish-audio/s2.1-pro")

    def test_llm_streams_tokens_and_falls_back(self):
        self.svc.llm_fail_models.add("primary/model")
        self.svc.llm_reply = "One two three."
        llm = OpenRouterLLM(self.s)

        async def go():
            return "".join([d async for d in llm.stream([{"role": "user", "content": "hi"}])])

        self.assertEqual(run(go()).strip(), "One two three.")
        models = [r["json"]["model"] for r in self.svc.find("/or/chat/completions")]
        self.assertEqual(models, ["primary/model", "backup/model"])
        self.assertEqual(self.svc.find("/or/chat/completions")[0]["headers"]["authorization"], "Bearer or-key")

    def test_llm_all_models_fail_raises(self):
        self.svc.llm_fail_models.update({"primary/model", "backup/model"})

        async def go():
            return [d async for d in OpenRouterLLM(self.s).stream([{"role": "user", "content": "hi"}])]

        with self.assertRaises(ProviderError):
            run(go())

    def test_llm_complete(self):
        self.svc.llm_reply = "plain answer"
        self.assertEqual(run(OpenRouterLLM(self.s).complete([{"role": "user", "content": "q"}])), "plain answer")

    def test_hf_stt_sends_wav(self):
        self.svc.stt_texts = ["hello world"]
        self.svc.stt_calls = 0
        stt = HFWhisperSTT(self.s.hf_base_url, "hf-key", "openai/whisper-large-v3-turbo")
        text = run(stt.transcribe(b"\x01\x00" * 1600, 16000))
        req = self.svc.find("/hf/openai/whisper-large-v3-turbo")[0]
        self.assertEqual(text, "hello world")
        self.assertEqual(req["headers"]["authorization"], "Bearer hf-key")
        self.assertEqual(req["headers"]["content-type"], "audio/wav")
        self.assertEqual(req["raw"][:4], b"RIFF")

    def test_fish_stt_multipart(self):
        text = run(FishCompatSTT(self.s.fish_base_url, "fish-key").transcribe(b"\x01\x00" * 1600, 16000))
        req = self.svc.find("/fish/audio/transcriptions")[0]
        self.assertEqual(text, "fish heard this")
        self.assertIn(b"fish-audio/transcribe-1", req["raw"])
        self.assertIn("multipart/form-data", req["headers"]["content-type"])


if __name__ == "__main__":
    unittest.main()
