"""Live smoke test for actions: local HTTP server + real VoiceSession (no ffmpeg, no API keys).

    python scripts/actions_smoke.py

Everything here uses the local machine, so it opts into private URLs.
"""
import asyncio
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("ACTIONS_ALLOW_PRIVATE", "1")  # must precede the import: the guard reads it at import time

from app.actions import ActionRunner  # noqa: E402
from app.providers import MockLLM, MockSTT, MockTTS, Providers  # noqa: E402
from app.session import VoiceSession  # noqa: E402

RECEIVED: list[dict] = []


class Hook(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        RECEIVED.append(body)
        time_taken = body["data"].get("time")
        ok = time_taken != "09:00"  # pretend 9am is already booked
        out = json.dumps({
            "ok": ok,
            "message": f"Appointment confirmed for {body['data'].get('date')} at {time_taken}." if ok
            else "9am is taken. 11am or 2pm are free.",
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


class Transport:
    out_rate = 8000

    def __init__(self):
        self.events = []

    async def send_audio(self, pcm):
        pass

    async def clear(self):
        pass

    async def send_event(self, e):
        self.events.append(e)

    async def hangup(self):
        pass

    def say(self):
        return " ".join(e["text"] for e in self.events if e.get("role") == "assistant")


def main() -> int:
    srv = HTTPServer(("127.0.0.1", 0), Hook)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_port}/exec"

    biz = {
        "company": "Sunrise Solar", "agent_name": "Sam", "greeting": "Thanks for calling.",
        "actions": [{"type": "calendar", "url": url}],
    }
    llm = MockLLM([
        'I have John on 555 1234 for a home assessment on 3 November at 3pm. Is that correct? '
        '[[ACTION book_appointment {"name": "John", "phone": "5551234", "service": "home assessment", '
        '"date": "2026-11-03", "time": "15:00"}]]',
        "Great, one moment. [[CONFIRM]]",
        "All set, John. Your home assessment is confirmed for 3 November at 3pm.",
    ])
    t = Transport()
    runner = ActionRunner(biz["actions"], company="Sunrise Solar")
    s = VoiceSession(
        settings=__import__("app.config", fromlist=["Settings"]).Settings.load(),
        providers=Providers(MockSTT(), llm, MockTTS()), transport=t, business=biz,
        channel="phone", actions=runner, meta={"from": "+15551234567"},
    )

    async def go():
        await s.start()
        await s.user_text("John here, 3 November at 3pm for a home assessment.")
        await asyncio.sleep(0.5)  # let the agent finish its read-back
        print("after proposal  -> calls:", len(RECEIVED), "| pending:", runner.pending is not None)
        await s.user_text("Yes, that's correct.")
        await asyncio.sleep(1.0)

    s.s.realtime_pacing = False
    asyncio.run(go())
    print("after confirm   -> calls:", len(RECEIVED), "| log:", runner.log)
    print("agent said      ->", t.say())
    assert len(RECEIVED) == 1, "action must run only after the caller confirms"
    assert RECEIVED[0]["data"]["time"] == "15:00"
    assert "[[" not in t.say(), "markers must never be spoken"
    assert "confirmed" in t.say(), "agent must tell the caller the outcome"
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
