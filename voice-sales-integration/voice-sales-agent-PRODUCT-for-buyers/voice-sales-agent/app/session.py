"""Voice conversation engine: VAD -> STT -> LLM (streamed) -> TTS, with barge-in.

A ``Transport`` (Telnyx phone call, website websocket, ...) only has to provide:

    out_rate: int                              sample rate of audio it plays
    async send_audio(pcm16: bytes)             queue audio for playback
    async clear()                              drop queued audio (barge-in)
    async send_event(dict)                     UI events (may be a no-op)
    async hangup()                             end the call
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Awaitable, Callable

import numpy as np

from .audio import VAD, resample
from .config import Settings
from .prompt import END_MARKER_RE, build_system_prompt
from .providers import CANONICAL_TTS_RATE, Providers

log = logging.getLogger("session")

_SENT_END_RE = re.compile(r"[.!?]+[\"')\]]*\s+")
FALLBACK_LINE = (
    "I'm sorry, I'm having a technical problem on my side. "
    "Please leave your name and number and someone will call you back shortly."
)


def split_sentences(buf: str, min_first: int = 0) -> tuple[list[str], str]:
    """Return (complete sentences, remainder). A sentence ends at .!? followed by whitespace."""
    out: list[str] = []
    pos = 0
    # a sentence ends at .!? (plus closing quotes/brackets) FOLLOWED by whitespace, so "4.99" never splits
    for m in _SENT_END_RE.finditer(buf):
        out.append(buf[pos : m.end()].strip())
        pos = m.end()
    rest = buf[pos:]
    # very long run without punctuation: cut at a comma so speech can start
    if len(rest) > 140 and "," in rest[40:]:
        cut = rest.rfind(",", 40, 140)
        if cut > 0:
            out.append(rest[: cut + 1].strip())
            rest = rest[cut + 1 :].lstrip()
    return out, rest


class VoiceSession:
    def __init__(
        self,
        *,
        settings: Settings,
        providers: Providers,
        transport,
        business: dict,
        channel: str,
        meta: dict | None = None,
        on_finish: Callable[[dict], Awaitable[None]] | None = None,
    ) -> None:
        self.s, self.p, self.t, self.biz = settings, providers, transport, business
        self.channel, self.meta = channel, meta or {}
        self.on_finish = on_finish
        self.vad = VAD(threshold=settings.vad_threshold, end_ms=settings.vad_end_ms)
        self.history: list[dict] = [{"role": "system", "content": build_system_prompt(business, channel, self.meta)}]
        self.transcript: list[dict] = []
        self.started = time.time()
        self.result: dict | None = None
        self.finished = asyncio.Event()

        self._turn: asyncio.Task | None = None
        self._watch: asyncio.Task | None = None
        self._play_until = 0.0
        self._end_after = False
        self._closed = False
        self._last_activity = time.monotonic()
        self._idle_prompts = 0
        self._stt_audio: bytes | None = None
        self._carry = b""
        self._failures = 0

    # ------------------------------------------------------------ lifecycle
    async def start(self) -> None:
        self._watch = asyncio.create_task(self._watchdog())
        greeting = self.biz["greeting"]
        self._record("assistant", greeting)
        self.history.append({"role": "assistant", "content": greeting})
        await self.t.send_event({"type": "transcript", "role": "assistant", "text": greeting})
        self._turn = asyncio.create_task(self._say(greeting))

    async def close(self, reason: str, hangup: bool = False) -> None:
        if self._closed:
            return
        self._closed = True
        me = asyncio.current_task()
        for task in (self._turn, self._watch):
            if task and task is not me and not task.done():
                task.cancel()
        if hangup:
            try:
                await self.t.hangup()
            except Exception as e:  # noqa: BLE001
                log.warning("hangup failed: %s", e)
        ended = time.time()
        self.result = {
            "channel": self.channel,
            "caller": self.meta.get("from"),
            "callee": self.meta.get("to"),
            "call_id": self.meta.get("call_id"),
            "started": self.started,
            "ended": ended,
            "duration": round(ended - self.started, 1),
            "end_reason": reason,
            "transcript": self.transcript,
        }
        self.finished.set()
        if self.on_finish:
            try:
                await self.on_finish(self.result)
            except Exception:  # noqa: BLE001
                log.exception("on_finish failed")

    # --------------------------------------------------------------- inputs
    async def feed_pcm16k(self, pcm: bytes) -> None:
        if self._closed:
            return
        for kind, data in self.vad.feed(pcm):
            if kind == "start":
                self._last_activity = time.monotonic()
                if self._speaking_now():
                    await self._interrupt()
            elif kind == "end":
                self._last_activity = time.monotonic()
                audio = self._carry + data
                self._carry = b""
                self._turn = asyncio.create_task(self._turn_from_audio(audio))

    async def user_text(self, text: str) -> None:
        """Typed message from the website chat box."""
        text = text.strip()
        if not text or self._closed:
            return
        await self._interrupt()
        self._last_activity = time.monotonic()
        self._turn = asyncio.create_task(self._respond(text))

    # ------------------------------------------------------------- internals
    def _record(self, role: str, text: str) -> None:
        self.transcript.append({"role": role, "text": text, "ts": round(time.time() - self.started, 1)})

    def _speaking_now(self) -> bool:
        busy = self._turn is not None and not self._turn.done()
        return busy or time.monotonic() < self._play_until

    async def _interrupt(self) -> None:
        task = self._turn
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        if self._stt_audio is not None:  # user spoke again while we were transcribing: merge
            self._carry = self._stt_audio
            self._stt_audio = None
        self._play_until = 0.0
        self._end_after = False
        try:
            await self.t.clear()
        except Exception:  # noqa: BLE001
            pass

    async def _say(self, text: str) -> None:
        try:
            pcm = await self.p.tts.synth(text)
            await self._play(pcm)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.error("greeting TTS failed: %s", e)

    async def _play(self, pcm24k: np.ndarray) -> None:
        out = resample(pcm24k, CANONICAL_TTS_RATE, self.t.out_rate)
        chunk = self.t.out_rate // 5  # 200 ms frames
        for i in range(0, len(out), chunk):
            if self.s.realtime_pacing:
                ahead = self._play_until - time.monotonic()
                if ahead > 0.6:
                    await asyncio.sleep(ahead - 0.4)
            piece = out[i : i + chunk]
            await self.t.send_audio(piece.astype("<i2").tobytes())
            self._play_until = max(self._play_until, time.monotonic()) + len(piece) / self.t.out_rate

    async def _drain(self) -> None:
        if self.s.realtime_pacing:
            wait = self._play_until - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait + 0.4)

    async def _turn_from_audio(self, audio: bytes) -> None:
        self._stt_audio = audio
        try:
            text = (await self.p.stt.transcribe(audio, 16000)).strip()
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.error("STT failed: %s", e)
            self._stt_audio = None
            await self._handle_failure()
            return
        self._stt_audio = None
        if len(re.sub(r"[^A-Za-z0-9]", "", text)) < 2:
            return
        await self._respond(text)

    def _window(self) -> list[dict]:
        return [self.history[0]] + self.history[1:][-24:]

    async def _respond(self, user_text: str) -> None:
        self._record("user", user_text)
        self.history.append({"role": "user", "content": user_text})
        await self.t.send_event({"type": "transcript", "role": "user", "text": user_text})

        played: list[str] = []
        synth_tasks: list[asyncio.Task] = []
        q: asyncio.Queue = asyncio.Queue()

        async def player() -> None:
            while True:
                fut = await q.get()
                if fut is None:
                    return
                try:
                    pcm = await fut
                except asyncio.CancelledError:
                    raise
                except Exception as e:  # noqa: BLE001
                    log.error("TTS failed: %s", e)
                    continue
                text = fut.sentence  # type: ignore[attr-defined]
                played.append(text)
                await self.t.send_event({"type": "transcript", "role": "assistant", "text": text, "partial": True})
                await self._play(pcm)

        def emit(sentence: str) -> None:
            if END_MARKER_RE.search(sentence):
                self._end_after = True
                sentence = END_MARKER_RE.sub("", sentence)
            sentence = sentence.strip()
            if sentence:
                task = asyncio.create_task(self.p.tts.synth(sentence))
                task.sentence = sentence  # type: ignore[attr-defined]
                synth_tasks.append(task)
                q.put_nowait(task)

        player_task = asyncio.create_task(player())
        got_any = False
        try:
            buf = ""
            async for delta in self.p.llm.stream(self._window()):
                got_any = True
                buf += delta
                sentences, buf = split_sentences(buf)
                for s in sentences:
                    emit(s)
            if buf.strip():
                emit(buf)
            q.put_nowait(None)
            await player_task
        except asyncio.CancelledError:
            player_task.cancel()
            for t in synth_tasks:
                t.cancel()
            if played:
                self._record("assistant", " ".join(played) + " [interrupted]")
                self.history.append({"role": "assistant", "content": " ".join(played)})
            raise
        except Exception as e:  # noqa: BLE001
            log.error("LLM failed: %s", e)
            player_task.cancel()
            for t in synth_tasks:
                t.cancel()
            if not got_any:
                await self._handle_failure()
                return
        if played:
            full = " ".join(played)
            self._record("assistant", full)
            self.history.append({"role": "assistant", "content": full})
            self._failures = 0
        self._last_activity = time.monotonic() + max(0.0, self._play_until - time.monotonic())
        if self._end_after:
            await self._drain()
            await self.close("agent_ended", hangup=True)

    async def _handle_failure(self) -> None:
        self._failures += 1
        if self._failures >= 2:
            self._record("assistant", FALLBACK_LINE)
            try:
                await self._play(await self.p.tts.synth(FALLBACK_LINE))
            except Exception:  # noqa: BLE001
                pass
            await self._drain()
            await self.close("error", hangup=True)

    async def _watchdog(self) -> None:
        try:
            while not self._closed:
                await asyncio.sleep(1.0)
                now = time.monotonic()
                if time.time() - self.started > self.s.max_call_s:
                    await self._say_and_close("I have to wrap up now. Thank you for calling, goodbye!", "max_duration")
                    return
                if self._speaking_now():
                    continue
                if now - self._last_activity > self.s.idle_prompt_s:
                    self._idle_prompts += 1
                    if self._idle_prompts >= 3:
                        await self._say_and_close("I haven't heard from you, so I'll let you go. Goodbye!", "idle")
                        return
                    self._last_activity = now
                    self._turn = asyncio.create_task(self._say("Are you still there?"))
        except asyncio.CancelledError:
            pass

    async def _say_and_close(self, text: str, reason: str) -> None:
        self._record("assistant", text)
        try:
            await self._play(await self.p.tts.synth(text))
        except Exception:  # noqa: BLE001
            pass
        await self._drain()
        await self.close(reason, hangup=True)
