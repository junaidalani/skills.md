#!/usr/bin/env python3
"""Free local TTS: expose edge-tts as an OpenAI-compatible /audio/speech server.

Used as a stop-gap while OpenRouter's free fish-audio/s2.1-pro-free is gone:

    python scripts/edge_tts_server.py            # listens on :8787

then in agent.yaml:

    voice:
      provider: custom
      base_url: http://localhost:8787

No API key, no cost (Microsoft Edge online voices). The "model" field maps
to an edge-tts voice, e.g. "aria" -> en-US-AriaNeural, "guy" -> en-US-GuyNeural.
"""
from __future__ import annotations

import io
import os

import edge_tts
import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

VOICE_ALIASES = {
    "aria": "en-US-AriaNeural",
    "sam": "en-US-AriaNeural",
    "guy": "en-US-GuyNeural",
    "jenny": "en-US-JennyNeural",
    "sonia": "en-GB-SoniaNeural",
    "natasha": "en-AU-NatashaNeural",
    "emma": "en-GB-EmmaNeural",
    "ava": "en-US-AvaNeural",
}


def resolve_voice(name: str) -> str:
    n = (name or "").strip()
    if not n:
        return "en-US-AriaNeural"
    return VOICE_ALIASES.get(n.lower(), n)


async def speech(request: Request) -> Response:
    body = await request.json()
    text = (body.get("input") or "").strip()
    if not text:
        return Response(status_code=400, content='{"error": "empty input"}')
    voice = resolve_voice(body.get("model") or body.get("voice") or "")
    try:
        buf = io.BytesIO()
        # slight speed-up sounds more natural on sales calls
        com = edge_tts.Communicate(text, voice, rate="+12%", pitch="+0Hz")
        async for chunk in com.stream():
            if chunk["type"] == "audio" and chunk["data"]:
                buf.write(chunk["data"])
        audio = buf.getvalue()
        if not audio:
            return Response(status_code=502, content='{"error": "no audio"}')
        return Response(content=audio, media_type="audio/mpeg")
    except Exception as e:  # noqa: BLE001
        return Response(status_code=502, content=f'{{"error": "{e}"}}')


api = Starlette(routes=[Route("/v1/audio/speech", speech, methods=["POST"])])

if __name__ == "__main__":
    port = int(os.environ.get("EDGE_TTS_PORT", "8787"))
    print(f"edge-tts OpenAI-compatible TTS server on http://localhost:{port} (free, no API key)")
    uvicorn.run(api, host="127.0.0.1", port=port, log_level="warning")
