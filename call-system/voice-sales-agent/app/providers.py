"""Service providers: LLM (OpenRouter), TTS (Fish Audio S2.1 Pro), STT (HF Whisper / Fish).

All network calls use ``requests`` in worker threads so the event loop never blocks.
Mock providers exist so the whole pipeline can be exercised offline.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
from dataclasses import dataclass
from typing import AsyncIterator, Callable

import numpy as np
import requests

from .audio import decode_with_ffmpeg, pcm_array, resample, to_wav
from .config import Settings

log = logging.getLogger("providers")

CANONICAL_TTS_RATE = 24000  # every TTS provider returns int16 mono at this rate


class ProviderError(RuntimeError):
    pass


def _clip(text: str, n: int = 300) -> str:
    return (text or "")[:n].replace("\n", " ")


# ------------------------------------------------------------------------ LLM
class OpenRouterLLM:
    def __init__(self, s: Settings):
        self.s = s
        self.models = [s.llm_model] + [m for m in s.llm_fallback_models if m != s.llm_model]

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.s.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": self.s.public_base_url or "http://localhost",
            "X-Title": "Voice Sales Agent",
        }

    def _url(self) -> str:
        return f"{self.s.openrouter_base_url}/chat/completions"

    async def complete(self, messages: list[dict], max_tokens: int = 700, temperature: float = 0.1) -> str:
        def work() -> str:
            last = "no models tried"
            for model in self.models:
                try:
                    r = requests.post(
                        self._url(),
                        headers=self._headers(),
                        json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature},
                        timeout=60,
                    )
                    if r.status_code >= 400:
                        last = f"{model}: HTTP {r.status_code} {_clip(r.text)}"
                        continue
                    return r.json()["choices"][0]["message"]["content"] or ""
                except Exception as e:  # noqa: BLE001
                    last = f"{model}: {type(e).__name__}: {e}"
            raise ProviderError(f"LLM failed on all models; last: {last}")

        return await asyncio.to_thread(work)

    async def stream(self, messages: list[dict], max_tokens: int = 220, temperature: float = 0.6) -> AsyncIterator[str]:
        loop = asyncio.get_running_loop()
        q: asyncio.Queue = asyncio.Queue()
        stop = threading.Event()

        def put(item):
            loop.call_soon_threadsafe(q.put_nowait, item)

        def work():
            last = "no models tried"
            try:
                for model in self.models:
                    if stop.is_set():
                        break
                    yielded = False
                    resp = None
                    try:
                        resp = requests.post(
                            self._url(),
                            headers=self._headers(),
                            json={
                                "model": model,
                                "messages": messages,
                                "max_tokens": max_tokens,
                                "temperature": temperature,
                                "stream": True,
                            },
                            stream=True,
                            timeout=(10, 60),
                        )
                        if resp.status_code >= 400:
                            last = f"{model}: HTTP {resp.status_code} {_clip(resp.text)}"
                            continue
                        for raw in resp.iter_lines(decode_unicode=True):
                            if stop.is_set():
                                return
                            if not raw or not raw.startswith("data:"):
                                continue
                            data = raw[5:].strip()
                            if data == "[DONE]":
                                break
                            try:
                                delta = json.loads(data)["choices"][0]["delta"].get("content")
                            except (json.JSONDecodeError, KeyError, IndexError):
                                continue
                            if delta:
                                yielded = True
                                put(delta)
                        if yielded:
                            return
                        last = f"{model}: empty response"
                    except Exception as e:  # noqa: BLE001
                        last = f"{model}: {type(e).__name__}: {e}"
                        if yielded:
                            return
                    finally:
                        if resp is not None:
                            resp.close()
                put(ProviderError(f"LLM failed on all models; last: {last}"))
            finally:
                put(None)

        t = threading.Thread(target=work, daemon=True)
        t.start()
        try:
            while True:
                item = await q.get()
                if item is None:
                    return
                if isinstance(item, Exception):
                    raise item
                yield item
        finally:
            stop.set()


# ------------------------------------------------------------------------ TTS
class OpenAICompatTTS:
    """POST {base}/audio/speech -> raw audio bytes.

    Works for OpenRouter (model fish-audio/s2.1-pro-free) and for Fish Audio's own
    OpenRouter-compatible endpoint (model fish-audio/s2.1-pro).
    """

    def __init__(self, base_url: str, api_key: str, model: str, voice: str, fmt: str, pcm_rate: int, referer: str = ""):
        self.base_url, self.api_key, self.model, self.voice = base_url, api_key, model, voice
        self.fmt, self.pcm_rate, self.referer = fmt, pcm_rate, referer

    def build_payload(self, text: str) -> dict:
        payload = {"model": self.model, "input": text, "response_format": self.fmt}
        if self.voice:
            payload["voice"] = self.voice
        return payload

    def _request(self, text: str) -> bytes:
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        if self.referer:
            headers["HTTP-Referer"] = self.referer
            headers["X-Title"] = "Voice Sales Agent"
        last = ""
        for attempt in range(3):
            r = requests.post(f"{self.base_url}/audio/speech", headers=headers, json=self.build_payload(text), timeout=60)
            if r.status_code == 200 and r.content:
                return r.content
            last = f"HTTP {r.status_code} {_clip(r.text)}"
            if r.status_code in (429, 502, 503, 504):
                threading.Event().wait(0.6 * (attempt + 1))
                continue
            break
        raise ProviderError(f"TTS failed: {last}")

    def _to_pcm24k(self, raw: bytes) -> np.ndarray:
        if self.fmt == "pcm":
            return resample(pcm_array(raw), self.pcm_rate, CANONICAL_TTS_RATE)
        return decode_with_ffmpeg(raw, CANONICAL_TTS_RATE)

    async def synth(self, text: str) -> np.ndarray:
        def work() -> np.ndarray:
            return self._to_pcm24k(self._request(text))

        return await asyncio.to_thread(work)


# ------------------------------------------------------------------------ STT
class HFWhisperSTT:
    """Hugging Face Inference (hf-inference) automatic speech recognition."""

    def __init__(self, base_url: str, token: str, model: str):
        self.url = f"{base_url}/{model}"
        self.token = token

    async def transcribe(self, pcm16k: bytes, rate: int = 16000) -> str:
        wav = to_wav(pcm16k, rate)

        def work() -> str:
            last = ""
            for attempt in range(4):
                r = requests.post(
                    self.url,
                    headers={"Authorization": f"Bearer {self.token}", "Content-Type": "audio/wav"},
                    data=wav,
                    timeout=60,
                )
                if r.status_code == 200:
                    data = r.json()
                    return (data.get("text") if isinstance(data, dict) else "") or ""
                last = f"HTTP {r.status_code} {_clip(r.text)}"
                if r.status_code in (503, 429):  # model loading / rate limit
                    threading.Event().wait(1.5 * (attempt + 1))
                    continue
                break
            raise ProviderError(f"STT failed: {last}")

        return await asyncio.to_thread(work)


class FishCompatSTT:
    """Fish Audio transcription via its OpenAI-compatible /audio/transcriptions endpoint."""

    def __init__(self, base_url: str, api_key: str, model: str = "fish-audio/transcribe-1"):
        self.url = f"{base_url}/audio/transcriptions"
        self.api_key, self.model = api_key, model

    async def transcribe(self, pcm16k: bytes, rate: int = 16000) -> str:
        wav = to_wav(pcm16k, rate)

        def work() -> str:
            r = requests.post(
                self.url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                files={"file": ("audio.wav", wav, "audio/wav")},
                data={"model": self.model},
                timeout=60,
            )
            if r.status_code != 200:
                raise ProviderError(f"STT failed: HTTP {r.status_code} {_clip(r.text)}")
            return r.json().get("text", "")

        return await asyncio.to_thread(work)


# ---------------------------------------------------------------------- mocks
class MockSTT:
    """Returns scripted caller lines in order (for tests and --mock demos)."""

    def __init__(self, script: list[str] | None = None):
        self.script = list(script or ["Hi, I'd like to know about your family solar package."])
        self.calls = 0

    async def transcribe(self, pcm16k: bytes, rate: int = 16000) -> str:
        i = min(self.calls, len(self.script) - 1)
        self.calls += 1
        return self.script[i]


class MockLLM:
    """Scripted agent replies; also answers extraction prompts with a regex-built JSON."""

    def __init__(self, replies: list[str] | None = None):
        self.replies = list(replies or ["Sure, happy to help. May I have your name?"])
        self.calls = 0
        self.last_messages: list[dict] = []

    async def stream(self, messages: list[dict], **_) -> AsyncIterator[str]:
        self.last_messages = messages
        i = min(self.calls, len(self.replies) - 1)
        self.calls += 1
        for word in self.replies[i].split(" "):
            await asyncio.sleep(0)
            yield word + " "

    async def complete(self, messages: list[dict], **_) -> str:
        import re

        full = messages[-1]["content"]
        text = "\n".join(line for line in full.splitlines() if line.startswith("Caller:"))
        m_email = re.search(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", text)
        m_name = re.search(r"(?:my name is|this is|i am|i'm) ([A-Z][a-z]+(?: [A-Z][a-z]+)?)", text)
        m_phone = re.search(r"\+?\d[\d \-]{8,}\d", text)
        return json.dumps(
            {
                "name": m_name.group(1) if m_name else None,
                "phone": m_phone.group(0).replace(" ", "") if m_phone else None,
                "email": m_email.group(0) if m_email else None,
                "company": None,
                "interest": "family solar package",
                "budget": None,
                "timeline": None,
                "preferred_callback_time": None,
                "outcome": "lead",
                "summary": "Caller asked about solar packages and left contact details.",
                "next_step": "Call back to book a free home assessment.",
            }
        )


class MockTTS:
    """Generates a tone whose length scales with the text (no network)."""

    async def synth(self, text: str) -> np.ndarray:
        secs = max(0.3, min(6.0, 0.04 * len(text)))
        t = np.arange(int(CANONICAL_TTS_RATE * secs)) / CANONICAL_TTS_RATE
        return (6000 * np.sin(2 * np.pi * 220 * t)).astype(np.int16)


# -------------------------------------------------------------------- factory
@dataclass
class Providers:
    stt: object
    llm: object
    tts: object


def build_providers(s: Settings) -> Providers:
    if s.mock_mode:
        return Providers(
            stt=MockSTT(
                [
                    "Hi, I'd like to know about your family solar package.",
                    "My name is Junaid Alani and my email is junaidalani2001@gmail.com, my number is +15551234567.",
                    "No that's everything, thank you, goodbye.",
                ]
            ),
            llm=MockLLM(
                [
                    "Our Family Solar system is six kilowatts and starts from seventeen thousand five hundred dollars before incentives. May I have your name and email so a consultant can book your free assessment?",
                    "Thanks Junaid, I have your details and a consultant will call to confirm your free home assessment. Is there anything else?",
                    "Wonderful, thanks for calling Sunrise Solar. Goodbye! [[END_CALL]]",
                ]
            ),
            tts=MockTTS(),
        )

    llm = OpenRouterLLM(s)
    if s.tts_provider == "fish":
        tts = OpenAICompatTTS(s.fish_base_url, s.fish_api_key, s.tts_model, s.tts_voice, s.tts_format, s.tts_pcm_rate)
    else:
        tts = OpenAICompatTTS(
            s.openrouter_base_url, s.openrouter_api_key, s.tts_model, s.tts_voice, s.tts_format, s.tts_pcm_rate,
            referer=s.public_base_url or "http://localhost",
        )
    if s.stt_provider == "fish":
        stt = FishCompatSTT(s.fish_base_url, s.fish_api_key)
    else:
        stt = HFWhisperSTT(s.hf_base_url, s.hf_token, s.stt_model)
    return Providers(stt=stt, llm=llm, tts=tts)
