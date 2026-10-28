"""Local fake services so the real requests/smtplib code runs against something."""
from __future__ import annotations

import json
import socketserver
import subprocess
import tempfile
import threading
import time
from dataclasses import replace
from email import message_from_string
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np

from app.config import ROOT, Settings


def make_mp3(sec: float = 1.0) -> bytes:
    return subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", f"sine=frequency=440:duration={sec}", "-f", "mp3", "pipe:1"],
        capture_output=True, check=True,
    ).stdout


def make_pcm(sec: float, rate: int = 44100) -> bytes:
    t = np.arange(int(rate * sec)) / rate
    return (6000 * np.sin(2 * np.pi * 440 * t)).astype("<i2").tobytes()


class FakeServices:
    """OpenRouter + Hugging Face + Fish + Telnyx + n8n on one port. Records every request."""

    def __init__(self) -> None:
        self.requests: list[dict] = []
        self.llm_reply = "Happy to help with that. What is your name?"
        self.llm_fail_models: set[str] = set()
        self.stt_texts = ["I would like a solar quote"]
        self.stt_calls = 0
        self.tts_status = 200
        self.resend_status = 200
        self.extraction = {
            "name": "Junaid Alani", "phone": "+15551234567", "email": "junaidalani2001@gmail.com", "company": None,
            "interest": "family solar", "budget": None, "timeline": None, "preferred_callback_time": "tomorrow morning",
            "outcome": "lead", "summary": "Wants a family solar quote.", "next_step": "Call to book assessment.",
        }
        self.apps: list[dict] = []
        self.number = {"id": "num-1", "phone_number": "+15519007793", "connection_id": None}
        self.mp3 = make_mp3(1.0)
        outer = self

        class H(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.0"

            def log_message(self, *a):  # silence
                pass

            def _read(self) -> bytes:
                n = int(self.headers.get("Content-Length") or 0)
                return self.rfile.read(n) if n else b""

            def _send(self, code: int, body: bytes, ctype: str = "application/json") -> None:
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def _json(self, code: int, obj) -> None:
                self._send(code, json.dumps(obj).encode())

            def _handle(self, method: str) -> None:
                body = self._read()
                path = self.path.split("?")[0]
                rec = {"method": method, "path": path, "query": self.path.partition("?")[2],
                       "headers": {k.lower(): v for k, v in self.headers.items()}, "raw": body}
                try:
                    rec["json"] = json.loads(body) if body and "json" in (self.headers.get("Content-Type") or "") else None
                except ValueError:
                    rec["json"] = None
                outer.requests.append(rec)
                j = rec["json"] or {}

                # ---- OpenRouter
                if path.endswith("/chat/completions"):
                    if j.get("model") in outer.llm_fail_models:
                        return self._json(500, {"error": "boom"})
                    last = (j.get("messages") or [{}])[-1].get("content", "")
                    if last.startswith("You extract"):
                        content = json.dumps(outer.extraction)
                        return self._json(200, {"choices": [{"message": {"content": content}}]})
                    if j.get("stream"):
                        chunks = "".join(
                            "data: " + json.dumps({"choices": [{"delta": {"content": w + " "}}]}) + "\n\n"
                            for w in outer.llm_reply.split(" ")
                        ) + "data: [DONE]\n\n"
                        return self._send(200, chunks.encode(), "text/event-stream")
                    return self._json(200, {"choices": [{"message": {"content": outer.llm_reply}}]})
                if path.endswith("/audio/speech"):
                    if outer.tts_status != 200:
                        return self._json(outer.tts_status, {"error": "tts down"})
                    if j.get("response_format") == "pcm":
                        return self._send(200, make_pcm(1.0, 44100), "audio/pcm")
                    return self._send(200, outer.mp3, "audio/mpeg")
                # ---- Hugging Face / Fish STT
                if path.startswith("/hf/"):
                    i = min(outer.stt_calls, len(outer.stt_texts) - 1)
                    outer.stt_calls += 1
                    return self._json(200, {"text": outer.stt_texts[i]})
                if path.endswith("/audio/transcriptions"):
                    return self._json(200, {"text": "fish heard this"})
                if "/v1/text-to-speech/" in path:  # ElevenLabs
                    if outer.tts_status != 200:
                        return self._json(outer.tts_status, {"detail": "tts down"})
                    return self._send(200, outer.mp3, "audio/mpeg")
                if path == "/resend/emails":
                    if outer.resend_status != 200:
                        return self._json(outer.resend_status, {"message": "nope"})
                    return self._json(200, {"id": "email-1"})
                # ---- n8n
                if path == "/n8n":
                    return self._json(200, {"ok": True})
                # ---- Telnyx
                if path.startswith("/telnyx/calls/") and "/actions/" in path:
                    return self._json(200, {"data": {"result": "ok"}})
                if path == "/telnyx/calls" and method == "POST":
                    return self._json(200, {"data": {"call_control_id": "new-call", "call_session_id": "s1"}})
                if path == "/telnyx/call_control_applications":
                    if method == "GET":
                        return self._json(200, {"data": outer.apps})
                    app = {"id": "app-1", "application_name": j.get("application_name")}
                    outer.apps.append(app)
                    return self._json(201, {"data": app})
                if path.startswith("/telnyx/call_control_applications/") and method == "PATCH":
                    return self._json(200, {"data": {"id": path.rsplit("/", 1)[1]}})
                if path == "/telnyx/phone_numbers" and method == "GET":
                    return self._json(200, {"data": [outer.number]})
                if path == "/telnyx/phone_numbers/num-1":
                    if method == "PATCH":
                        outer.number["connection_id"] = j.get("connection_id")
                    return self._json(200, {"data": outer.number})
                self._json(404, {"error": f"no fake route {method} {path}"})

            def do_GET(self):
                self._handle("GET")

            def do_POST(self):
                self._handle("POST")

            def do_PATCH(self):
                self._handle("PATCH")

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.srv.server_address[1]}"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def find(self, path: str) -> list[dict]:
        return [r for r in self.requests if r["path"] == path]

    def stop(self) -> None:
        self.srv.shutdown()
        self.srv.server_close()


class SMTPSink(socketserver.ThreadingTCPServer):
    """Minimal real SMTP server (no TLS/auth) that stores received messages."""

    allow_reuse_address = True
    daemon_threads = True

    class _H(socketserver.StreamRequestHandler):
        def handle(self):
            w = lambda s: self.wfile.write((s + "\r\n").encode())  # noqa: E731
            w("220 sink ESMTP")
            data_mode, buf = False, []
            for raw in self.rfile:
                line = raw.decode(errors="replace").rstrip("\r\n")
                if data_mode:
                    if line == ".":
                        self.server.messages.append(message_from_string("\n".join(buf)))
                        data_mode, buf = False, []
                        w("250 OK queued")
                    else:
                        buf.append(line[1:] if line.startswith("..") else line)
                    continue
                cmd = line.upper()
                if cmd.startswith(("EHLO", "HELO")):
                    w("250-sink")
                    w("250 8BITMIME")
                elif cmd == "DATA":
                    data_mode = True
                    w("354 go ahead")
                elif cmd == "QUIT":
                    w("221 bye")
                    break
                else:
                    w("250 OK")

    def __init__(self) -> None:
        self.messages: list = []
        super().__init__(("127.0.0.1", 0), self._H)
        self.port = self.server_address[1]
        threading.Thread(target=self.serve_forever, daemon=True).start()

    def wait_for(self, n: int = 1, timeout: float = 10.0) -> list:
        end = time.time() + timeout
        while time.time() < end and len(self.messages) < n:
            time.sleep(0.05)
        return self.messages

    def stop(self) -> None:
        self.shutdown()
        self.server_close()


def message_text(msg) -> str:
    out = []
    for part in msg.walk():
        if part.get_content_maintype() == "text":
            out.append(part.get_payload(decode=True).decode("utf-8", "replace"))
    return "\n".join(out)


def base_settings(tmp: Path, svc: FakeServices | None = None, sink: SMTPSink | None = None, **over) -> Settings:
    kw = dict(
        data_dir=tmp, public_base_url="https://agent.test", admin_token="adm", realtime_pacing=False, mock_mode=False,
        llm_provider="openrouter", llm_api_key="or-key", llm_model="primary/model", llm_fallback_models=["backup/model"],
        tts_provider="openrouter", tts_api_key="or-key", tts_model="fish-audio/s2.1-pro-free", tts_voice="", tts_format="mp3",
        stt_provider="hf", stt_api_key="hf-key", stt_model="openai/whisper-large-v3-turbo",
        telnyx_api_key="tk", telnyx_phone_number="+15519007793", telnyx_connection_id="app-1", telnyx_public_key="",
        smtp_user="", smtp_pass="", smtp_security="starttls", lead_email_to="junaidalani2001@gmail.com",
        n8n_webhook_url="", resend_api_key="", email_method="auto", vad_end_ms=500,
    )
    if svc:
        kw.update(llm_base_url=svc.url + "/or", tts_base_url=svc.url + "/or", stt_base_url=svc.url + "/hf",
                  telnyx_base_url=svc.url + "/telnyx", resend_base_url=svc.url + "/resend")
    if sink:
        kw.update(smtp_host="127.0.0.1", smtp_port=sink.port, smtp_security="none")
    kw.update(over)
    return replace(Settings.load(ROOT / "agent.yaml"), **kw)


def tmpdir() -> Path:
    return Path(tempfile.mkdtemp())
