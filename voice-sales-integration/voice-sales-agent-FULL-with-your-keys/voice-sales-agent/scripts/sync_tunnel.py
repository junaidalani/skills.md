"""Point the carriers and .env at whatever URL the voice service is reachable on.

The quick tunnel URL changes every restart, so Telnyx's Call Control webhook and
each Twilio number's VoiceUrl must be re-pointed after each start.

    python scripts/sync_tunnel.py                      # use PUBLIC_BASE_URL from .env
    python scripts/sync_tunnel.py https://new.trycloudflare.com
    python scripts/sync_tunnel.py --check              # exit 1 if carriers drifted
"""
from __future__ import annotations

import base64
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in open(ROOT / ".env", encoding="utf-8-sig"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    # A running tunnel writes its public URL into the log; prefer the newest one.
    log = os.environ.get("TUNNEL_LOG")
    if log and Path(log).exists():
        found = re.findall(r"https://[a-z0-9-]+\.trycloudflare\.com", Path(log).read_text(errors="ignore"))
        if found:
            values["_TUNNEL_URL"] = found[-1]
    return values


def call(url: str, auth: str, method: str = "GET", body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Authorization": auth, "Accept": "application/json"}
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read()
    return json.loads(raw) if raw else {}


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check_only = "--check" in sys.argv
    values = env()
    base = (args[0] if args else values.get("_TUNNEL_URL") or values.get("PUBLIC_BASE_URL") or "").rstrip("/")
    if not base.startswith("https://"):
        print("No https base URL (pass one or set PUBLIC_BASE_URL)")
        return 2

    telnyx_url = f"{base}/telnyx/webhook"
    twilio_voice = f"{base}/twilio/voice"
    drift: list[str] = []

    tk = values.get("TELNYX_API_KEY")
    if tk:
        apps = call("https://api.telnyx.com/v2/call_control_applications?page[size]=10", f"Bearer {tk}")
        for app in apps.get("data", []):
            current = app.get("webhook_event_url")
            if current == telnyx_url:
                print(f"telnyx {app['id']} ok")
                continue
            drift.append(f"telnyx {app['id']}: {current} -> {telnyx_url}")
            if not check_only:
                call(
                    f"https://api.telnyx.com/v2/call_control_applications/{app['id']}",
                    f"Bearer {tk}",
                    "PATCH",
                    {"webhook_event_url": telnyx_url},
                )
                print(f"telnyx {app['id']} updated")

    sid, token = values.get("TWILIO_ACCOUNT_SID"), values.get("TWILIO_AUTH_TOKEN")
    if sid and token:
        auth = "Basic " + base64.b64encode(f"{sid}:{token}".encode()).decode()
        numbers = call(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/IncomingPhoneNumbers.json", auth)
        for number in numbers.get("incoming_phone_numbers", []):
            if number.get("voice_url") == twilio_voice:
                print(f"twilio {number['phone_number']} ok")
                continue
            drift.append(f"twilio {number['phone_number']}: {number.get('voice_url')} -> {twilio_voice}")
            if not check_only:
                call(
                    f"https://api.twilio.com/2010-04-01/Accounts/{sid}/IncomingPhoneNumbers/{number['sid']}.json",
                    auth,
                    "POST",
                    {"VoiceUrl": twilio_voice, "VoiceMethod": "POST"},
                )
                print(f"twilio {number['phone_number']} updated")

    if not check_only:
        path = ROOT / ".env"
        text = path.read_text(encoding="utf-8-sig")
        text, count = re.subn(r"(?m)^PUBLIC_BASE_URL=.*$", f"PUBLIC_BASE_URL={base}", text)
        if count:
            path.write_text(text, encoding="utf-8")

    if check_only and drift:
        print("\n".join(drift))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
