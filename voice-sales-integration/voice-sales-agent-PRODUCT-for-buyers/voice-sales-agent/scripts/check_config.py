#!/usr/bin/env python3
"""Explain, in plain English, whether agent.yaml is ready.

    python scripts/check_config.py                 # checks ./agent.yaml
    python scripts/check_config.py path/to/other.yaml
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import ConfigError, Settings, problems  # noqa: E402
from app.leads import Notifier  # noqa: E402


def main(argv: list[str]) -> int:
    try:
        s = Settings.load(argv[0] if argv else None)
    except ConfigError as e:
        print(f"ERROR: {e}")
        return 1
    print(f"Settings file : {s.config_path}")
    print(f"Brain (llm)   : {s.llm_provider} / {s.llm_model}")
    if s.engine == "s2s":
        print(f"Voice+listen  : speech-to-speech server at {s.s2s_url}")
    else:
        print(f"Voice         : {s.tts_provider} / {s.tts_model}" + (f" / voice {s.tts_voice}" if s.tts_voice else ""))
        print(f"Listening     : {s.stt_provider} / {s.stt_model}")
    print(f"Phone number  : {s.telnyx_phone_number or '(none)'}")
    order = Notifier(s).order()
    print(f"Lead emails   : {s.lead_email_to or '(nobody)'} via {' then '.join(order) if order else 'outbox folder only'}")
    print()
    items = problems(s)
    for level, msg in items:
        print(f"[{level.upper():7}] {msg}")
    errors = [m for lvl, m in items if lvl == "error"]
    print()
    print("READY: no errors." if not errors else f"NOT READY: fix the {len(errors)} error(s) above in agent.yaml.")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
