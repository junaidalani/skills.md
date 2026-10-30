#!/usr/bin/env python3
"""Full-pipeline voice E2E with REAL providers (no mocks).

Speaks the caller's lines through edge-tts, sends them as real PCMU (mu-law 8k)
phone audio over the Telnyx websocket media stream to a live server whose STT /
LLM / TTS are the real configured providers. Verifies the agent hears each line,
replies with actual audio, and the lead is extracted.

    .venv/Scripts/python scripts/voice_e2e.py
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
tmp = tempfile.mkdtemp()
os.environ.update(
    REALTIME_PACING="0",
    DATA_DIR=tmp,
    ADMIN_TOKEN="demo",
    PUBLIC_BASE_URL="https://demo.example",
    IDLE_PROMPT_S="120",
)

import numpy as np  # noqa: E402
from starlette.testclient import TestClient  # noqa: E402

from app.audio import resample, ulaw_decode, ulaw_encode  # noqa: E402
from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.providers import EdgeTTS  # noqa: E402

CALLER_LINES = [
    ("Hi, I'd like to know about your family solar package.", ["package", "solar"], False),
    ("My name is Junaid Alani, my email is junaid2001 at gmail.com and my number is +15551234567.", ["gmail"], False),
    ("Great, that is everything, thank you and goodbye.", ["goodbye", "thank"], True),  # the goodbye reply is valid
]

SILENCE_030 = np.zeros(2400, dtype=np.int16)   # 300 ms at 8 kHz
SILENCE_090 = np.zeros(7200, dtype=np.int16)   # 900 ms trailing silence


class WsMedia:
    """Reader thread: blocks on receive_text (no timeout support) and records everything the server sends."""

    def __init__(self, ws):
        self.ws = ws
        self.events: list[dict] = []
        self.audio = bytearray()
        self._t = threading.Thread(target=self._reader, daemon=True)
        self._t.start()

    def _reader(self):
        try:
            while True:
                self.events.append(json.loads(self.ws.receive_text()))
                # Telnyx outbound media events carry only media.payload (no track field)
                ev = self.events[-1]
                media = ev.get("media") or {}
                if ev.get("event") == "media" and not media.get("track"):
                    self.audio.extend(base64.b64decode(media["payload"]).ljust(160, b"\0")[:160])
        except Exception:  # noqa: BLE001 - closed
            pass

    def audio_seconds(self) -> float:
        return len(self.audio) / 8000.0

    def peak(self) -> int:
        pcm = ulaw_decode(bytes(self.audio))
        return int(np.abs(pcm).max()) if len(pcm) else 0


def main() -> int:
    t_start = time.time()

    # 1) pre-synthesize the caller audio BEFORE the session starts (network retries cost no session time)
    caller = EdgeTTS("en-US-AriaNeural")  # different voice than the agent's
    caller_lines_wav: list[bytes] = []
    for line, _, _ in CALLER_LINES:
        pcm8k = resample(asyncio.run(caller.synth(line)), 24000, 8000)
        caller_lines_wav.append(b"".join([ulaw_encode(SILENCE_030), ulaw_encode(pcm8k), ulaw_encode(SILENCE_090)]))
    print(f"caller audio ready ({len(caller_lines_wav)} lines) at {time.time() - t_start:.0f}s")

    s = Settings.load()
    app = create_app(s)
    token = app.state.ctx.settings.ws_secret

    states: dict[str, str] = {}

    with TestClient(app) as client, client.websocket_connect(f"/telnyx/media?token={token}") as ws:
        m = WsMedia(ws)
        ws.send_text(json.dumps({"event": "start", "start": {"call_control_id": "e2e-1",
                                                             "from": "+15550001111", "to": s.telnyx_phone_number,
                                                             "media_format": {"encoding": "PCMU"}}}))

        def transcripts() -> tuple[list[str], list[str]]:
            calls = client.get("/api/calls?token=demo").json()["calls"]
            trans = calls[0]["transcript"] if calls else []
            return ([x["text"] for x in trans if x["role"] == "assistant"],
                    [x["text"] for x in trans if x["role"] == "user"])

        def wait_until(pred, seconds: float) -> tuple[bool, float]:
            deadline = time.time() + seconds
            while time.time() < deadline:
                if pred():
                    return True, time.time() - t_start
                time.sleep(0.4)
            return False, seconds

        # ---- greeting: transcript entry AND real audio delivered
        got, at = wait_until(lambda: len(m.audio) > 0 and len(transcripts()[0]) >= 1, 120)
        states["greeting_transcript_and_audio"] = ("ok" if got else "missing") + f" ({at:.0f}s)"

        asst_n = len(transcripts()[0])
        UNWANTED = ("haven't heard", "haven't heard from you")

        def fresh_replies(base: int) -> list[str]:
            return [x for x in transcripts()[0][base:] if not any(u in x.lower() for u in UNWANTED)]

        for i, (line, keywords, bye_ok) in enumerate(CALLER_LINES):
            user_len = len(transcripts()[1])
            for j in range(0, len(caller_lines_wav[i]), 160):
                ws.send_text(json.dumps({"event": "media", "media": {"track": "inbound",
                                                                     "payload": base64.b64encode(caller_lines_wav[i][j:j + 160]).decode()}}))

            def heard() -> bool:
                users = transcripts()[1]
                if len(users) <= user_len:
                    return False
                return any(k in " ".join(users[user_len:]).lower() for k in keywords)

            def replied() -> bool:
                replies = fresh_replies(asst_n)
                if not replies:
                    return False
                if not bye_ok and any(g in " ".join(replies).lower() for g in ("goodbye", "let you go")):
                    return False
                return True

            ok_heard, at = wait_until(heard, 150)
            heard_flag = ok_heard
            replied_flag = False
            if heard_flag:
                got_r, _ = wait_until(replied, 120)
                replied_flag = got_r
            if replied_flag:
                asst_n = len(transcripts()[0])
            states[f"turn{i + 1}_heard"] = ("ok" if heard_flag else "NOT-HEARD") + f" ({at:.0f}s)"
            states[f"turn{i + 1}_replied"] = "ok" if replied_flag else "NO-REPLY"

        wait_until(lambda: False, 15)  # let the agent finish speaking
        ws.send_text(json.dumps({"event": "stop"}))
        rec = None
        for _ in range(300):
            calls = client.get("/api/calls?token=demo").json()["calls"]
            if calls:
                rec = calls[0]
                break
            time.sleep(0.15)

    if not rec:
        print("FAIL: no call recorded")
        return 1

    ok = True

    print("=== TRANSCRIPT (live STT + LLM + TTS) ===")
    for t in rec["transcript"]:
        print(f"{'Caller' if t['role'] == 'user' else 'Agent '}: {t['text']}")

    amd = m.audio_seconds()
    print(f"\nAgent audio received: {amd:.1f}s, peak amplitude {m.peak()} (mu-law 0-32124)")
    if amd < 2.0 or m.peak() < 1000:
        print("FAIL: agent produced too little real audio")
        ok = False
    print("=== STATES ===")
    print(json.dumps(states, indent=2))
    for k, v in states.items():
        if not v.startswith("ok"):
            print(f"FAIL: {k} = {v}")
            ok = False
    lead = rec.get("lead") or {}
    print("=== LEAD ===")
    print(json.dumps(lead, indent=2))
    # STT on 8 kHz phone audio can misspell names/emails; accept fuzzy matches
    email_ok = "gmail" in str(lead.get("email", "")).lower()
    phone_ok = "5551234567" in "".join(ch for ch in str(lead.get("phone", "")) if ch.isdigit())
    name_ok = any(x in str(lead.get("name", "")).lower() for x in ("junaid", "alani", "dalani"))
    if not email_ok:
        print("FAIL: lead.email missing a gmail address")
        ok = False
    if not phone_ok:
        print("FAIL: lead.phone missing 15551234567")
        ok = False
    if not name_ok:
        print("FAIL: lead.name missing a Junaid/Alani-like name")
        ok = False

    print(f"\nvoice_e2e wall clock: {time.time() - t_start:.0f}s")
    print(f"voice_e2e: {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
