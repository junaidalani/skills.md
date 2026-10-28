"""Optional ENGINE=s2s: true voice-to-voice through a huggingface/speech-to-speech server.

The Hugging Face server (https://github.com/huggingface/speech-to-speech) speaks the OpenAI Realtime
protocol on ws://HOST:8765/v1/realtime and does VAD + STT + LLM + TTS itself. This class bridges
a Transport (phone call / website) to it. It exposes the same interface as ``VoiceSession``.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from typing import Awaitable, Callable

import numpy as np

from .audio import pcm_array, resample
from .config import Settings
from .prompt import build_system_prompt

log = logging.getLogger("s2s")


async def _default_connect(url: str):
    try:
        from websockets.asyncio.client import connect  # websockets >= 13
    except ImportError:  # pragma: no cover
        from websockets import connect  # type: ignore
    return await connect(url, max_size=None)


class S2SSession:
    def __init__(self, *, settings: Settings, transport, business: dict, channel: str, meta: dict | None = None,
                 on_finish: Callable[[dict], Awaitable[None]] | None = None, connect=None):
        self.s, self.t, self.biz, self.channel = settings, transport, business, channel
        self.meta = meta or {}
        self.on_finish = on_finish
        self._connect = connect or _default_connect
        self.ws = None
        self._reader: asyncio.Task | None = None
        self.transcript: list[dict] = []
        self.started = time.time()
        self.result: dict | None = None
        self.finished = asyncio.Event()
        self._closed = False

    async def start(self) -> None:
        self.ws = await self._connect(self.s.s2s_url)
        await self._send(
            {
                "type": "session.update",
                "session": {
                    "type": "realtime",
                    "instructions": build_system_prompt(self.biz, self.channel, self.meta),
                    "audio": {"input": {"turn_detection": {"type": "server_vad", "interrupt_response": True}}},
                },
            }
        )
        self._reader = asyncio.create_task(self._read_loop())
        # have the server speak the greeting
        await self._send(
            {"type": "response.create",
             "response": {"instructions": f"Say exactly this greeting to the caller: {self.biz['greeting']}"}}
        )

    async def _send(self, obj: dict) -> None:
        await self.ws.send(json.dumps(obj))

    async def feed_pcm16k(self, pcm: bytes) -> None:
        if self._closed or self.ws is None:
            return
        x = resample(pcm_array(pcm), 16000, self.s.s2s_rate)
        await self._send({"type": "input_audio_buffer.append", "audio": base64.b64encode(x.astype("<i2").tobytes()).decode()})

    async def user_text(self, text: str) -> None:
        await self._send({"type": "conversation.item.create",
                          "item": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": text}]}})
        await self._send({"type": "response.create"})

    async def _read_loop(self) -> None:
        try:
            async for raw in self.ws:
                try:
                    ev = json.loads(raw)
                except (TypeError, json.JSONDecodeError):
                    continue
                et = ev.get("type", "")
                if et in ("response.output_audio.delta", "response.audio.delta"):
                    pcm = pcm_array(base64.b64decode(ev.get("delta", "")))
                    out = resample(pcm, self.s.s2s_rate, self.t.out_rate)
                    await self.t.send_audio(out.astype("<i2").tobytes())
                elif et == "input_audio_buffer.speech_started":
                    await self.t.clear()
                elif et == "conversation.item.input_audio_transcription.completed":
                    self._add("user", ev.get("transcript", ""))
                elif et in ("response.output_audio_transcript.done", "response.audio_transcript.done"):
                    self._add("assistant", ev.get("transcript", ""))
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("s2s connection ended: %s", e)

    def _add(self, role: str, text: str) -> None:
        text = (text or "").strip()
        if text:
            self.transcript.append({"role": role, "text": text, "ts": round(time.time() - self.started, 1)})

    async def close(self, reason: str, hangup: bool = False) -> None:
        if self._closed:
            return
        self._closed = True
        if self._reader and not self._reader.done():
            self._reader.cancel()
        try:
            if self.ws is not None:
                await self.ws.close()
        except Exception:  # noqa: BLE001
            pass
        if hangup:
            try:
                await self.t.hangup()
            except Exception:  # noqa: BLE001
                pass
        ended = time.time()
        self.result = {
            "channel": self.channel, "caller": self.meta.get("from"), "callee": self.meta.get("to"),
            "call_id": self.meta.get("call_id"), "started": self.started, "ended": ended,
            "duration": round(ended - self.started, 1), "end_reason": reason, "transcript": self.transcript,
        }
        self.finished.set()
        if self.on_finish:
            await self.on_finish(self.result)
