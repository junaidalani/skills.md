#!/usr/bin/env python3
"""Create/update the Telnyx Call Control application and attach your phone number to it.

    python scripts/setup_telnyx.py --public-url https://your-tunnel.example.com [--write-env]

After this, calls to TELNYX_PHONE_NUMBER hit POST {public-url}/telnyx/webhook.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import ROOT, Settings  # noqa: E402

APP_NAME = "voice-sales-agent"


def write_env(updates: dict[str, str]) -> None:
    path = ROOT / ".env"
    text = path.read_text() if path.exists() else ""
    for k, v in updates.items():
        if re.search(rf"^{k}=.*$", text, flags=re.M):
            text = re.sub(rf"^{k}=.*$", f"{k}={v}", text, flags=re.M)
        else:
            text += ("" if text.endswith("\n") or not text else "\n") + f"{k}={v}\n"
    path.write_text(text)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--public-url", help="public https URL that reaches this server")
    ap.add_argument("--write-env", action="store_true", help="save TELNYX_CONNECTION_ID / PUBLIC_BASE_URL into .env")
    args = ap.parse_args(argv)

    s = Settings.load()
    url = (args.public_url or s.public_base_url).rstrip("/")
    if not url.startswith("https://"):
        print("ERROR: need --public-url https://... (Telnyx only calls https webhooks)")
        return 2
    if not s.telnyx_api_key or not s.telnyx_phone_number:
        print("ERROR: TELNYX_API_KEY and TELNYX_PHONE_NUMBER must be set in .env")
        return 2

    base = s.telnyx_base_url
    H = {"Authorization": f"Bearer {s.telnyx_api_key}", "Content-Type": "application/json"}

    def call(method: str, path: str, **kw):
        r = requests.request(method, base + path, headers=H, timeout=30, **kw)
        if r.status_code >= 300:
            print(f"ERROR: {method} {path} -> HTTP {r.status_code}: {r.text[:400]}")
            raise SystemExit(1)
        return r.json().get("data")

    body = {"application_name": APP_NAME, "webhook_event_url": f"{url}/telnyx/webhook", "webhook_api_version": "2"}
    apps = call("GET", "/call_control_applications", params={"filter[application_name][contains]": APP_NAME, "page[size]": 50})
    existing = [a for a in (apps or []) if a.get("application_name") == APP_NAME]
    if existing:
        app_id = existing[0]["id"]
        call("PATCH", f"/call_control_applications/{app_id}", json=body)
        print(f"Updated Call Control application {app_id}")
    else:
        app_id = call("POST", "/call_control_applications", json=body)["id"]
        print(f"Created Call Control application {app_id}")

    nums = call("GET", "/phone_numbers", params={"filter[phone_number]": s.telnyx_phone_number})
    if not nums:
        print(f"ERROR: number {s.telnyx_phone_number} not found on this Telnyx account")
        return 1
    num_id = nums[0]["id"]
    call("PATCH", f"/phone_numbers/{num_id}", json={"connection_id": app_id})
    check = call("GET", f"/phone_numbers/{num_id}")
    ok = str(check.get("connection_id")) == str(app_id)
    print(f"Number {s.telnyx_phone_number} -> application {app_id}: {'OK' if ok else 'MISMATCH'}")

    if args.write_env:
        write_env({"TELNYX_CONNECTION_ID": app_id, "PUBLIC_BASE_URL": url})
        print("Saved TELNYX_CONNECTION_ID and PUBLIC_BASE_URL to .env")
    print(f"\nWebhook: {url}/telnyx/webhook\nNow call {s.telnyx_phone_number} from any phone.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
