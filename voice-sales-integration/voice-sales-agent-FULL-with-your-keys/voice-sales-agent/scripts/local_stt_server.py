#!/usr/bin/env python3
"""Free local STT: expose faster-whisper as an OpenAI-compatible /audio/transcriptions server.

Stop-gap for when the Hugging Face token cannot call Inference Providers:

    python scripts/local_stt_server.py           # listens on :8788

then in agent.yaml:

    listening:
      provider: custom
      base_url: http://localhost:8788/v1
      model: base.en

No API key, no cost, audio never leaves the machine. The model is downloaded once
from the public Hugging Face hub (no token needed) and cached under ~/.cache.
"""
from __future__ import annotations

import os
import subprocess

import numpy as np
import uvicorn
from faster_whisper import WhisperModel
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

MODEL_NAME = os.environ.get("LOCAL_STT_MODEL", "base.en")
_model: WhisperModel | None = None


def model() -> WhisperModel:
    global _model
    if _model is None:
        print(f"loading whisper model {MODEL_NAME} (first run downloads it)...")
        _model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
        print("model ready")
    return _model


def decode(data: bytes) -> np.ndarray:
    """Any container -> mono float32 at 16 kHz. Uses ffmpeg so PyAV is not needed."""
    proc = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", "16000", "pipe:1"],
        input=data, capture_output=True, timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg decode failed: {proc.stderr.decode(errors='replace')[:200]}")
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


async def transcribe(request: Request) -> JSONResponse:
    form = await request.form()
    upload = form.get("file")
    if upload is None:
        return JSONResponse({"error": "missing 'file'"}, status_code=400)
    data = await upload.read()
    if not data:
        return JSONResponse({"error": "empty file"}, status_code=400)
    try:
        audio = decode(data)
        segments, _info = model().transcribe(audio, language="en", vad_filter=True, beam_size=1)
        text = " ".join(s.text.strip() for s in segments).strip()
        return JSONResponse({"text": text})
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)}, status_code=502)


api = Starlette(routes=[Route("/v1/audio/transcriptions", transcribe, methods=["POST"])])

if __name__ == "__main__":
    port = int(os.environ.get("LOCAL_STT_PORT", "8788"))
    print(f"local whisper OpenAI-compatible STT server on http://localhost:{port} (free, no API key)")
    model()
    uvicorn.run(api, host="127.0.0.1", port=port, log_level="warning")
