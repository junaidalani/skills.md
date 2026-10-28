#!/usr/bin/env python3
"""Create the small file you hand to a buyer: agent.yaml with every secret and personal value blanked.

    python scripts/make_buyer_kit.py            # writes buyer-kit/agent.yaml (+ BUYER_GUIDE.md)

The buyer fills in their own keys, business details and email, then runs the agent (or sends the file to you).
"""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLANK = ["openrouter", "huggingface", "openai", "groq", "elevenlabs", "fish", "together", "mistral", "deepseek", "resend",
         "telnyx", "number", "connection_id", "public_key", "public_url", "send_leads_to", "smtp_user", "smtp_password",
         "n8n_webhook_url", "from"]


def make(src: Path, out_dir: Path) -> Path:
    text = src.read_text(encoding="utf-8")
    for key in BLANK:
        text = re.sub(rf'^(\s+{key}:)\s*"[^"]*"', r'\1 ""', text, flags=re.M)
        text = re.sub(rf"^(\s+{key}:)\s*'[^']*'", r'\1 ""', text, flags=re.M)
    text = re.sub(r'^(\s+admin_token:)\s*"[^"]*"', r'\1 "change-me-to-a-long-random-string"', text, flags=re.M)
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / "agent.yaml"
    dest.write_text(text, encoding="utf-8")
    guide = ROOT / "BUYER_GUIDE.md"
    if guide.exists():
        shutil.copy(guide, out_dir / "BUYER_GUIDE.md")
    return dest


if __name__ == "__main__":
    dest = make(ROOT / "agent.yaml", ROOT / "buyer-kit")
    print(f"Wrote {dest}")
    sys.exit(0)
