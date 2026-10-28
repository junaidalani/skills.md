"""Call storage, lead extraction and lead notification (email / n8n)."""
from __future__ import annotations

import json
import logging
import re
import smtplib
import sqlite3
import ssl
import threading
import time
import uuid
from email.message import EmailMessage
from html import escape
from pathlib import Path

import requests

from .audio import normalize_spoken_email
from .config import Settings
from .prompt import EXTRACTION_PROMPT, parse_json_object, render_transcript

log = logging.getLogger("leads")

EMAIL_RE = re.compile(r"^[\w.+-]+@[\w-]+(\.[\w-]+)+$")
PHONE_RE = re.compile(r"\+?\d[\d ()\-]{7,}\d")


# ---------------------------------------------------------------------- store
class Store:
    def __init__(self, data_dir: Path):
        data_dir.mkdir(parents=True, exist_ok=True)
        self.path = data_dir / "calls.db"
        self._lock = threading.Lock()
        self._db = sqlite3.connect(self.path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute(
            """CREATE TABLE IF NOT EXISTS calls(
                 id TEXT PRIMARY KEY, channel TEXT, caller TEXT, callee TEXT,
                 started REAL, ended REAL, duration REAL, end_reason TEXT,
                 outcome TEXT, summary TEXT, lead TEXT, transcript TEXT, notify TEXT)"""
        )
        self._db.commit()

    def save(self, rec: dict) -> str:
        cid = rec.get("id") or uuid.uuid4().hex[:12]
        with self._lock:
            self._db.execute(
                "INSERT OR REPLACE INTO calls VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    cid, rec.get("channel"), rec.get("caller"), rec.get("callee"),
                    rec.get("started"), rec.get("ended"), rec.get("duration"), rec.get("end_reason"),
                    rec.get("outcome"), rec.get("summary"),
                    json.dumps(rec.get("lead") or {}), json.dumps(rec.get("transcript") or []),
                    json.dumps(rec.get("notify") or {}),
                ),
            )
            self._db.commit()
        return cid

    def _row(self, r: sqlite3.Row) -> dict:
        d = dict(r)
        for k in ("lead", "transcript", "notify"):
            d[k] = json.loads(d[k]) if d.get(k) else ({} if k != "transcript" else [])
        return d

    def list(self, limit: int = 100) -> list[dict]:
        with self._lock:
            rows = self._db.execute("SELECT * FROM calls ORDER BY started DESC LIMIT ?", (limit,)).fetchall()
        return [self._row(r) for r in rows]

    def get(self, cid: str) -> dict | None:
        with self._lock:
            r = self._db.execute("SELECT * FROM calls WHERE id=?", (cid,)).fetchone()
        return self._row(r) if r else None


# ----------------------------------------------------------------- extraction
def _fallback_extract(turns: list[dict], caller: str | None) -> dict:
    user_text = " ".join(t["text"] for t in turns if t["role"] == "user")
    email = normalize_spoken_email(user_text)
    m_phone = PHONE_RE.search(user_text)
    return {
        "name": None,
        "phone": (m_phone.group(0) if m_phone else None) or caller,
        "email": email,
        "company": None,
        "interest": None,
        "budget": None,
        "timeline": None,
        "preferred_callback_time": None,
        "outcome": "lead" if (email or m_phone) else "no_action",
        "summary": "Automatic summary unavailable; see transcript.",
        "next_step": None,
    }


def clean_lead(lead: dict, caller: str | None) -> dict:
    keys = ["name", "phone", "email", "company", "interest", "budget", "timeline", "preferred_callback_time",
            "outcome", "summary", "next_step"]
    out = {k: (lead.get(k) if lead.get(k) not in ("", "null", "None") else None) for k in keys}
    if out["email"]:
        e = str(out["email"]).strip().lower()
        e = normalize_spoken_email(e) or e
        out["email"] = e if EMAIL_RE.match(e) else None
    if not out["phone"] and caller:
        out["phone"] = caller
    if out["outcome"] not in ("sale", "lead", "support", "callback", "no_action"):
        out["outcome"] = "lead" if (out["email"] or out["phone"]) else "no_action"
    out["summary"] = out["summary"] or "No summary."
    return out


async def extract_lead(llm, turns: list[dict], caller: str | None) -> dict:
    user_turns = [t for t in turns if t["role"] == "user"]
    if not user_turns:
        return clean_lead({"outcome": "no_action", "summary": "Caller did not speak."}, caller)
    try:
        raw = await llm.complete(
            [
                {"role": "system", "content": "You output only valid JSON."},
                {"role": "user", "content": EXTRACTION_PROMPT + render_transcript(turns)},
            ]
        )
        lead = parse_json_object(raw)
        if lead is None:
            raise ValueError(f"unparseable extraction: {raw[:120]!r}")
    except Exception as e:  # noqa: BLE001
        log.warning("lead extraction failed (%s); using regex fallback", e)
        lead = _fallback_extract(turns, caller)
    return clean_lead(lead, caller)


# ------------------------------------------------------------------- notifier
class Notifier:
    def __init__(self, s: Settings):
        self.s = s

    # ---- message construction
    def build_message(self, rec: dict) -> EmailMessage:
        lead = rec.get("lead") or {}
        company = rec.get("company") or "Voice Sales Agent"
        who = lead.get("name") or rec.get("caller") or "Unknown caller"
        subj = f"[{company}] New {lead.get('outcome', 'lead')}: {who}"
        if lead.get("interest"):
            subj += f" - {lead['interest']}"
        rows = [
            ("Name", lead.get("name")), ("Phone", lead.get("phone")), ("Email", lead.get("email")),
            ("Company", lead.get("company")), ("Interested in", lead.get("interest")),
            ("Budget", lead.get("budget")), ("Timeline", lead.get("timeline")),
            ("Best callback time", lead.get("preferred_callback_time")),
            ("Outcome", lead.get("outcome")), ("Next step", lead.get("next_step")),
            ("Channel", rec.get("channel")), ("Caller ID", rec.get("caller")),
            ("Duration (s)", rec.get("duration")), ("Ended", rec.get("end_reason")),
        ]
        transcript = render_transcript(rec.get("transcript") or [])
        text = f"{lead.get('summary', '')}\n\n" + "\n".join(f"{k}: {v}" for k, v in rows if v not in (None, "")) + \
               f"\n\n--- Transcript ---\n{transcript}\n"
        html = (
            f"<h2>{escape(subj)}</h2><p>{escape(str(lead.get('summary', '')))}</p><table cellpadding='4'>"
            + "".join(f"<tr><td><b>{escape(k)}</b></td><td>{escape(str(v))}</td></tr>" for k, v in rows if v not in (None, ""))
            + f"</table><h3>Transcript</h3><pre style='white-space:pre-wrap'>{escape(transcript)}</pre>"
        )
        msg = EmailMessage()
        msg["Subject"] = subj
        msg["From"] = self.s.email_from or self.s.smtp_user or "voice-agent@localhost"
        msg["To"] = self.s.lead_email_to
        msg.set_content(text)
        msg.add_alternative(html, subtype="html")
        return msg

    # ---- channels
    def _smtp(self, msg: EmailMessage) -> str:
        sec = self.s.smtp_security
        if sec == "ssl":
            server = smtplib.SMTP_SSL(self.s.smtp_host, self.s.smtp_port, context=ssl.create_default_context(), timeout=30)
        else:
            server = smtplib.SMTP(self.s.smtp_host, self.s.smtp_port, timeout=30)
        try:
            server.ehlo()
            if sec == "starttls":
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if self.s.smtp_user and self.s.smtp_pass:
                server.login(self.s.smtp_user, self.s.smtp_pass)
            server.send_message(msg)
        finally:
            try:
                server.quit()
            except Exception:  # noqa: BLE001
                pass
        return "sent"

    def _webhook(self, rec: dict) -> str:
        r = requests.post(self.s.n8n_webhook_url, json=rec, timeout=20)
        if r.status_code >= 300:
            raise RuntimeError(f"HTTP {r.status_code}")
        return "sent"

    def _outbox(self, msg: EmailMessage) -> str:
        box = self.s.data_dir / "outbox"
        box.mkdir(parents=True, exist_ok=True)
        path = box / f"{int(time.time())}-{uuid.uuid4().hex[:6]}.eml"
        path.write_bytes(bytes(msg))
        return str(path)

    def send(self, rec: dict) -> dict:
        """Blocking; run in a thread. Never raises. Returns per-channel status."""
        msg = self.build_message(rec)
        status: dict[str, str] = {}
        if self.s.n8n_webhook_url:
            try:
                status["n8n"] = self._webhook(rec)
            except Exception as e:  # noqa: BLE001
                status["n8n"] = f"failed: {type(e).__name__}: {e}"
        if self.s.smtp_user or self.s.smtp_security == "none":
            try:
                status["smtp"] = self._smtp(msg)
            except Exception as e:  # noqa: BLE001
                status["smtp"] = f"failed: {type(e).__name__}: {e}"
        if not any(v == "sent" for v in status.values()):
            status["outbox"] = self._outbox(msg)  # never lose a lead
            if not status.get("smtp") and not status.get("n8n"):
                status["note"] = "No SMTP_USER / N8N_WEBHOOK_URL configured; email saved to outbox instead."
        return status
