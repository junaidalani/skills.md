"""Audio helpers: G.711 mu-law, resampling, voice activity detection, ffmpeg decode.

Python 3.13 removed ``audioop``, so mu-law is implemented with numpy.
"""
from __future__ import annotations

import io
import math
import re
import subprocess
import wave
from collections import deque

import numpy as np
from scipy.signal import resample_poly


# --------------------------------------------------------------------- mu-law
def _build_ulaw_decode() -> np.ndarray:
    table = np.zeros(256, dtype=np.int16)
    for i in range(256):
        u = ~i & 0xFF
        sign = u & 0x80
        exponent = (u >> 4) & 0x07
        mantissa = u & 0x0F
        mag = (((mantissa << 3) + 0x84) << exponent) - 0x84
        table[i] = -mag if sign else mag
    return table


_ULAW_DEC = _build_ulaw_decode()


def ulaw_decode(data: bytes) -> np.ndarray:
    return _ULAW_DEC[np.frombuffer(data, dtype=np.uint8)]


def ulaw_encode(pcm: np.ndarray) -> bytes:
    x = pcm.astype(np.int32)
    sign = (x < 0).astype(np.int32)
    x = np.minimum(np.abs(x), 32635) + 0x84
    exponent = np.clip(np.floor(np.log2(x)).astype(np.int32) - 7, 0, 7)
    mantissa = (x >> (exponent + 3)) & 0x0F
    u = ~((sign << 7) | (exponent << 4) | mantissa) & 0xFF
    return u.astype(np.uint8).tobytes()


# ----------------------------------------------------------------- resampling
def resample(pcm: np.ndarray, src: int, dst: int) -> np.ndarray:
    """High quality resample of a whole int16 buffer (use for TTS output)."""
    if src == dst or len(pcm) == 0:
        return pcm.astype(np.int16)
    g = math.gcd(src, dst)
    y = resample_poly(pcm.astype(np.float32), dst // g, src // g)
    return np.clip(np.rint(y), -32768, 32767).astype(np.int16)


class Up2:
    """Stateful 2x upsampler (8k -> 16k) for streaming phone audio."""

    def __init__(self) -> None:
        self.prev = 0.0

    def process(self, x: np.ndarray) -> np.ndarray:
        if len(x) == 0:
            return x.astype(np.int16)
        xf = x.astype(np.float32)
        prev = np.concatenate(([self.prev], xf[:-1]))
        out = np.empty(len(xf) * 2, dtype=np.float32)
        out[0::2] = (prev + xf) / 2.0
        out[1::2] = xf
        self.prev = float(xf[-1])
        return np.clip(np.rint(out), -32768, 32767).astype(np.int16)


def pcm_array(data: bytes) -> np.ndarray:
    return np.frombuffer(data[: len(data) // 2 * 2], dtype="<i2")


def to_wav(pcm: bytes, rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def decode_with_ffmpeg(data: bytes, rate: int) -> np.ndarray:
    """Decode any audio container (mp3, wav, ogg...) to mono int16 at ``rate``."""
    proc = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", str(rate), "pipe:1"],
        input=data,
        capture_output=True,
        timeout=30,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg decode failed: {proc.stderr.decode(errors='replace')[:200]}")
    return pcm_array(proc.stdout).copy()


# ------------------------------------------------------------------------ VAD
class VAD:
    """Energy based voice activity detector with an adaptive noise floor.

    ``feed()`` takes 16 kHz mono int16 bytes and returns events:
    ("start", None) when speech begins, ("end", audio_bytes) when an utterance
    ends, ("drop", None) when a too-short blip ended.
    """

    def __init__(
        self,
        rate: int = 16000,
        frame_ms: int = 20,
        threshold: float = 400.0,
        start_frames: int = 5,
        end_ms: int = 700,
        preroll_ms: int = 300,
        min_speech_ms: int = 250,
        max_utt_s: float = 25.0,
    ) -> None:
        self.frame_ms = frame_ms
        self.frame_samples = rate * frame_ms // 1000
        self.threshold = threshold
        self.start_frames = start_frames
        self.end_ms = end_ms
        self.min_speech_ms = min_speech_ms
        self.max_ms = int(max_utt_s * 1000)
        self.noise = 100.0
        self.speaking = False
        self._buf = bytearray()
        self._pre: deque[bytes] = deque(maxlen=max(1, preroll_ms // frame_ms))
        self._utt: list[bytes] = []
        self._run = 0
        self._sil = 0
        self._speech_frames = 0

    def reset(self) -> None:
        self._buf.clear()
        self._pre.clear()
        self._utt = []
        self.speaking = False
        self._run = self._sil = self._speech_frames = 0

    def feed(self, pcm: bytes) -> list[tuple[str, bytes | None]]:
        events: list[tuple[str, bytes | None]] = []
        self._buf += pcm
        fb = self.frame_samples * 2
        while len(self._buf) >= fb:
            frame = bytes(self._buf[:fb])
            del self._buf[:fb]
            x = np.frombuffer(frame, dtype="<i2").astype(np.float32)
            rms = float(np.sqrt(np.mean(x * x)))
            voiced = rms > max(self.threshold, self.noise * 3.0)
            if not self.speaking:
                if not voiced:
                    self.noise = 0.98 * self.noise + 0.02 * rms
                self._pre.append(frame)
                self._run = self._run + 1 if voiced else 0
                if self._run >= self.start_frames:
                    self.speaking = True
                    self._utt = list(self._pre)
                    self._pre.clear()
                    self._sil = 0
                    self._speech_frames = self._run
                    events.append(("start", None))
            else:
                self._utt.append(frame)
                if voiced:
                    self._sil = 0
                    self._speech_frames += 1
                else:
                    self._sil += 1
                total_ms = len(self._utt) * self.frame_ms
                if self._sil * self.frame_ms >= self.end_ms or total_ms >= self.max_ms:
                    audio = b"".join(self._utt)
                    long_enough = self._speech_frames * self.frame_ms >= self.min_speech_ms
                    self.speaking = False
                    self._utt = []
                    self._run = self._sil = 0
                    events.append(("end", audio) if long_enough else ("drop", None))
        return events


# ----------------------------------------------------------- text conveniences
_SPOKEN_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")


def normalize_spoken_email(text: str) -> str | None:
    """'junaid dot ali at gmail dot com' -> 'junaid.ali@gmail.com'."""
    t = text.lower()
    m = _SPOKEN_EMAIL_RE.search(t)
    if m:
        return m.group(0)
    t = re.sub(r"\s+at\s+", "@", t)
    t = re.sub(r"\s+dot\s+", ".", t)
    t = re.sub(r"\bunderscore\b", "_", t)
    t = re.sub(r"\bdash\b", "-", t)
    # drop spaces around the @ and inside the local part / domain
    m = re.search(r"([\w.+\- ]+)@([\w\-. ]+)", t)
    if not m:
        return None
    cand = (m.group(1).split()[-1] if " " in m.group(1).strip() else m.group(1).strip()) + "@" + m.group(2).replace(" ", "")
    cand = cand.strip(".")
    return cand if _SPOKEN_EMAIL_RE.fullmatch(cand) else None
