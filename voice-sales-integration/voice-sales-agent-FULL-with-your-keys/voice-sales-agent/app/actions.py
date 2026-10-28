"""Mid-call actions (tools) that work with ANY chat model, no native tool-calling needed.

The model writes markers in its reply; they are stripped before speech:

    [[ACTION book_appointment {"date": "2026-11-03", "time": "15:00", "name": "John"}]]
    [[CONFIRM]]

Confirm-before-do is enforced in code, not trusted to the model: an action with
``confirm: true`` (default) is only *proposed* by ACTION. It runs when a later turn,
after the caller has spoken again, contains CONFIRM. The result is fed back so the
agent tells the caller what happened (booked / slot taken / sent).

Config (business.actions in agent.yaml, or per tenant from the site):

    actions:
      - {type: calendar, url: "https://script.google.com/macros/s/XXX/exec"}
      - {type: sheet, url: "https://script.google.com/macros/s/YYY/exec"}
      - {type: email, to: "owner@shop.com"}
      - {type: webhook, name: create_ticket, url: "https://n8n.example/webhook/z",
         description: "Open a support ticket", fields: [name, phone, problem]}
"""
from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import os
import re
import socket
from email.message import EmailMessage
from urllib.parse import urljoin, urlparse

import requests

log = logging.getLogger("actions")

ACTION_RE = re.compile(r"\[\[\s*ACTION\s+([a-z_][a-z0-9_]*)\s*([^\[\]]*?)\s*\]\]", re.S | re.I)
CONFIRM_RE = re.compile(r"\[\[\s*CONFIRM\s*\]\]", re.I)
ANY_MARKER_RE = re.compile(r"\[\[.*?\]\]", re.S)

# type -> default name, description, fields, needs caller confirmation
DEFAULTS = {
    "calendar": ("book_appointment", "Book an appointment slot in the business calendar",
                 ["name", "phone", "service", "date (YYYY-MM-DD)", "time (HH:MM 24h)"], True),
    "availability": ("check_availability", "Check which appointment times are free on a date",
                     ["date (YYYY-MM-DD)"], False),
    "sheet": ("save_details", "Save the caller's request as a row in the business spreadsheet",
              ["name", "phone", "email", "request"], True),
    "email": ("send_email", "Email the caller's request to the business team",
              ["name", "phone", "email", "subject", "message"], True),
    "webhook": ("run_webhook", "Send the details to the business system", ["name", "phone", "details"], True),
}
TIMEOUT_S = 12


class Action:
    def __init__(self, cfg: dict):
        self.type = cfg.get("type", "webhook")
        if self.type not in DEFAULTS:
            raise ValueError(f"unknown action type '{self.type}'")
        name, desc, fields, confirm = DEFAULTS[self.type]
        self.name = cfg.get("name") or name
        self.description = cfg.get("description") or desc
        self.fields = cfg.get("fields") or fields
        self.confirm = bool(cfg.get("confirm", confirm))
        self.url = cfg.get("url", "")
        self.secret = cfg.get("secret", "")
        self.to = cfg.get("to", "")
        if self.type != "email" and cfg.get("url") in (None, ""):
            raise ValueError(f"action '{self.name}' needs a url")


ALLOW_PRIVATE = os.environ.get("ACTIONS_ALLOW_PRIVATE") == "1"  # dev: n8n on your own machine


def safe_url(url: str) -> bool:
    """Tenants supply these URLs: https only and never a private/loopback address (SSRF guard)."""
    u = urlparse(url)
    if ALLOW_PRIVATE:
        return u.scheme in ("http", "https") and bool(u.hostname)
    if u.scheme != "https" or not u.hostname:
        return False
    try:
        infos = socket.getaddrinfo(u.hostname, u.port or 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            return False
    # ponytail: DNS can change between this check and the request (rebinding); pin the IP if that threat matters
    return True


class ActionRunner:
    def __init__(self, configs: list[dict] | None, notifier=None, company: str = "", http=requests.post):
        self.actions: dict[str, Action] = {}
        for c in configs or []:
            if c.get("type") != "email" and not c.get("url"):
                continue  # template entry left empty = off, not a mistake
            try:
                a = Action(c)
                self.actions[a.name] = a
            except ValueError as e:
                log.warning("skipping action: %s", e)
        self.notifier, self.company, self.http = notifier, company, http
        self.pending: tuple[Action, dict, int] | None = None  # (action, args, user_turn when proposed)
        self.log: list[dict] = []

    def __bool__(self) -> bool:
        return bool(self.actions)

    # ---------------------------------------------------------------- prompt
    def prompt_section(self) -> str:
        if not self.actions:
            return ""
        out = ["\nACTIONS YOU CAN TAKE (write the marker at the very END of your reply; it is silent):"]
        for a in self.actions.values():
            out.append(f'- {a.name}: {a.description}. Marker: [[ACTION {a.name} {{JSON with: {", ".join(a.fields)}}}]]'
                       + ("" if a.confirm else " (runs immediately, use it to look things up)"))
        out.append(
            "ACTION RULES:\n"
            "- Only use an action once you have every field. Use real values from the conversation, never placeholders.\n"
            "- In the SAME reply as the ACTION marker, read the details back in one short sentence and ask "
            "'Is that correct?'. The action does NOT run yet.\n"
            "- When the caller then says yes, reply briefly (for example 'Great, one moment.') and end with [[CONFIRM]].\n"
            "- If they correct something, write a new ACTION marker with the corrected details and ask again.\n"
            "- Never claim something is booked, saved or sent until you receive an ACTION RESULT saying it succeeded.\n"
            "- An ACTION RESULT message tells you what happened; tell the caller in one sentence."
        )
        return "\n".join(out)

    # ------------------------------------------------------------- markers
    @staticmethod
    def strip(text: str) -> str:
        return ANY_MARKER_RE.sub("", text)

    @classmethod
    def speech(cls, text: str) -> str:
        """Text safe to speak: markers removed, and anything after a half-written '[[...' dropped."""
        text = cls.strip(text)
        i = text.rfind("[[")
        return text[:i] if i >= 0 else text

    def handle(self, reply: str, user_turns: int) -> list[tuple[Action, dict]]:
        """Parse markers in a finished reply. Returns actions to execute now."""
        run: list[tuple[Action, dict]] = []
        proposed = False
        for m in ACTION_RE.finditer(reply):
            a = self.actions.get(m.group(1).lower())
            if not a:
                self.log.append({"action": m.group(1), "status": "unknown"})
                continue
            try:
                args = json.loads(m.group(2) or "{}")
                if not isinstance(args, dict):
                    raise ValueError
            except ValueError:
                self.log.append({"action": a.name, "status": "bad_json"})
                continue
            if a.confirm:
                self.pending = (a, args, user_turns)
                proposed = True
            else:
                run.append((a, args))
        if CONFIRM_RE.search(reply) and self.pending and not proposed:
            a, args, turn = self.pending
            if user_turns > turn:  # caller spoke after the read-back
                run.append((a, args))
                self.pending = None
            else:
                log.info("ignored CONFIRM in the same turn as the proposal")
        return run

    # ------------------------------------------------------------ execute
    async def execute(self, a: Action, args: dict, meta: dict) -> str:
        """Runs one action; never raises. Returns a note for the model."""
        try:
            res = await asyncio.wait_for(asyncio.to_thread(self._run, a, args, meta), TIMEOUT_S)
            ok, msg = bool(res.get("ok", True)), str(res.get("message") or "")
        except Exception as e:  # noqa: BLE001
            log.warning("action %s failed: %s", a.name, e)
            ok, msg = False, "the system did not respond"
        self.log.append({"action": a.name, "type": a.type, "args": args, "ok": ok, "message": msg})
        if ok:
            return f"ACTION RESULT {a.name}: SUCCESS. {msg}".strip()
        return (f"ACTION RESULT {a.name}: FAILED. {msg}. Apologise, offer another option if one fits, "
                "otherwise say the team will call back to finish it.")

    def _run(self, a: Action, args: dict, meta: dict) -> dict:
        if a.type == "email":
            return self._email(a, args)
        if not safe_url(a.url):
            return {"ok": False, "message": "action URL is not allowed"}
        body = {"action": a.name, "type": a.type, "company": self.company, "call_id": meta.get("call_id"),
                "caller": meta.get("from"), "secret": a.secret, "data": args}
        url = a.url
        for _ in range(3):  # Apps Script answers with a redirect; follow it, but only to safe hosts
            r = self.http(url, json=body, timeout=TIMEOUT_S)
            loc = getattr(r, "headers", {}).get("location") if r.status_code in (301, 302, 303, 307, 308) else None
            if not loc:
                break
            url = urljoin(url, loc)
            if not safe_url(url):
                return {"ok": False, "message": "action URL redirected somewhere not allowed"}
        if r.status_code >= 300:
            return {"ok": False, "message": f"HTTP {r.status_code}"}
        try:
            data = r.json()  # expected: {"ok": bool, "message": "..."}
        except ValueError:
            data = {}
        return data if isinstance(data, dict) else {}

    def _email(self, a: Action, args: dict) -> dict:
        if not self.notifier:
            return {"ok": False, "message": "email is not set up"}
        msg = EmailMessage()
        msg["Subject"] = f"[{self.company}] {args.get('subject') or a.name.replace('_', ' ')}"
        msg["From"] = self.notifier.s.email_from or self.notifier.s.smtp_login or "voice-agent@localhost"
        msg["To"] = a.to or self.notifier.s.lead_email_to
        msg.set_content("\n".join(f"{k}: {v}" for k, v in args.items()))
        for method in self.notifier.order():
            try:
                if method == "smtp":
                    self.notifier._smtp(msg)
                elif method == "resend":
                    self.notifier._resend(msg, {})
                else:
                    continue
                return {"ok": True, "message": "email sent"}
            except Exception as e:  # noqa: BLE001
                log.warning("action email via %s failed: %s", method, e)
        return {"ok": False, "message": "email could not be sent"}
