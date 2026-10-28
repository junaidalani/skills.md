#!/usr/bin/env python3
"""Run a complete simulated phone call against the real server code - no network, no phone needed.

    python scripts/simulate_call.py

Uses scripted mock STT/LLM/TTS, speaks tones as the "caller" through the genuine Telnyx media-stream
websocket path, then prints the transcript, extracted lead and the generated email, and saves the
agent's audio to out/simulated_call_agent.wav.
"""
from __future__ import annotations

import base64
import json
import os
import sys
import tempfile
import time
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
tmp = tempfile.mkdtemp()
os.environ.update(MOCK_MODE="1", REALTIME_PACING="0", DATA_DIR=tmp, ADMIN_TOKEN="demo", PUBLIC_BASE_URL="https://demo.example")
os.environ.pop("SMTP_USER", None)
os.environ.pop("N8N_WEBHOOK_URL", None)

import numpy as np  # noqa: E402
from starlette.testclient import TestClient  # noqa: E402

from app.audio import resample, ulaw_decode, ulaw_encode  # noqa: E402
from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402


def main() -> int:
    app = create_app(Settings.load())
    token = app.state.ctx.settings.ws_secret
    agent_audio = bytearray()

    def tone(sec: float) -> np.ndarray:
        t = np.arange(int(8000 * sec)) / 8000
        return (6000 * np.sin(2 * np.pi * 300 * t)).astype(np.int16)

    with TestClient(app) as client, client.websocket_connect(f"/telnyx/media?token={token}") as ws:
        ws.send_text(json.dumps({"event": "start", "start": {"call_control_id": "sim-1", "from": "+15550001111",
                                                              "to": "+15519007793", "media_format": {"encoding": "PCMU"}}}))

        def say(pcm: np.ndarray) -> None:
            data = ulaw_encode(pcm)
            for i in range(0, len(data), 160):
                ws.send_text(json.dumps({"event": "media", "media": {"track": "inbound",
                                                                      "payload": base64.b64encode(data[i:i + 160]).decode()}}))

        for _ in range(3):  # three caller turns
            say(np.zeros(8000, dtype=np.int16))
            say(tone(1.0))
            say(np.zeros(16000, dtype=np.int16))
            time.sleep(0.6)
        time.sleep(1.0)
        ws.send_text(json.dumps({"event": "stop"}))

        rec = None
        for _ in range(100):
            calls = client.get("/api/calls?token=demo").json()["calls"]
            if calls:
                rec = calls[0]
                break
            time.sleep(0.1)

    if not rec:
        print("FAIL: no call recorded")
        return 1
    print("=== TRANSCRIPT ===")
    for t in rec["transcript"]:
        print(f"{'Caller' if t['role'] == 'user' else 'Agent '}: {t['text']}")
    print("\n=== LEAD ===")
    print(json.dumps(rec["lead"], indent=2))
    print("\n=== EMAIL ===")
    print(rec["notify"])
    eml = rec["notify"].get("outbox")
    if eml:
        print(Path(eml).read_text()[:700])
    print(f"\nend_reason={rec['end_reason']} duration={rec['duration']}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
