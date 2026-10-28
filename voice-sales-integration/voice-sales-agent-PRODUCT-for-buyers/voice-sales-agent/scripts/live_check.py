#!/usr/bin/env python3
"""Check every external service with your real credentials, one by one.

    python scripts/live_check.py                # LLM, TTS, STT, Telnyx
    python scripts/live_check.py --send-email   # also sends a test lead email

It prints PASS/FAIL per service with the reason, and saves out/tts_test.wav so you can listen.
If voice.format is pcm it also measures the PCM sample rate for you.
"""
from __future__ import annotations

import argparse
import asyncio
import subprocess
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.audio import decode_with_ffmpeg, resample, to_wav  # noqa: E402
from app.config import ROOT, Settings, problems  # noqa: E402
from app.leads import Notifier  # noqa: E402
from app.providers import build_providers  # noqa: E402

results: list[tuple[str, bool, str]] = []


def report(name: str, ok: bool, detail: str) -> None:
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")


async def main_async(args) -> int:
    s = Settings.load()
    (ROOT / "out").mkdir(exist_ok=True)
    for level, msg in problems(s):
        if level == "error":
            print(f"[CONFIG ERROR] {msg}")
    if any(level == "error" for level, _ in problems(s)):
        print("Fix the config errors above first (python scripts/check_config.py explains each one).")
        return 1
    print(f"Using: brain={s.llm_provider}:{s.llm_model}  voice={s.tts_provider}:{s.tts_model}  listening={s.stt_provider}:{s.stt_model}")
    prov = build_providers(s)

    # 1. LLM
    try:
        t0 = time.time()
        text = await prov.llm.complete([{"role": "user", "content": "Reply with exactly: ready"}], max_tokens=20)
        report(f"LLM ({s.llm_provider})", bool(text.strip()), f"{text.strip()[:60]!r} in {time.time() - t0:.1f}s, model {s.llm_model}")
    except Exception as e:  # noqa: BLE001
        report(f"LLM ({s.llm_provider})", False, str(e)[:300])

    # 2. TTS
    sample_pcm = None
    try:
        t0 = time.time()
        pcm = await prov.tts.synth("Hello, thanks for calling Sunrise Solar. How can I help you today?")
        dt = time.time() - t0
        sample_pcm = pcm
        (ROOT / "out" / "tts_test.wav").write_bytes(to_wav(pcm.tobytes(), 24000))
        report(f"Voice ({s.tts_provider})", len(pcm) > 24000 // 2, f"{len(pcm) / 24000:.1f}s of audio in {dt:.1f}s, saved out/tts_test.wav")
    except Exception as e:  # noqa: BLE001
        report(f"Voice ({s.tts_provider})", False, str(e)[:300])

    # 2b. PCM sample-rate calibration (only informative)
    if s.tts_provider in ("openrouter", "fish", "openai", "custom") and s.tts_format == "pcm":
        try:
            text = "Hello, thanks for calling. How can I help you today?"
            hdr = {"Authorization": f"Bearer {s.tts_api_key}"}
            base = {"model": s.tts_model, "input": text}
            if s.tts_voice:
                base["voice"] = s.tts_voice
            mp3 = requests.post(f"{s.tts_base_url}/audio/speech", headers=hdr, json={**base, "response_format": "mp3"}, timeout=60).content
            raw = requests.post(f"{s.tts_base_url}/audio/speech", headers=hdr, json={**base, "response_format": "pcm"}, timeout=60).content
            dur = len(decode_with_ffmpeg(mp3, 24000)) / 24000
            rate = len(raw) / 2 / dur
            report("TTS pcm rate calibration", True, f"pcm is ~{rate:.0f} Hz -> if you use TTS_FORMAT=pcm set TTS_PCM_RATE={round(rate / 1000) * 1000}")
        except Exception as e:  # noqa: BLE001
            report("TTS pcm rate calibration", False, str(e)[:200])

    # 3. STT (round trip: speak, then transcribe our own TTS audio)
    try:
        if sample_pcm is None:
            raise RuntimeError("skipped: TTS failed so there is no audio to transcribe")
        pcm16 = resample(sample_pcm, 24000, 16000).astype("<i2").tobytes()
        t0 = time.time()
        text = await prov.stt.transcribe(pcm16, 16000)
        report(f"Listening ({s.stt_provider})", "thank" in text.lower() or "sunrise" in text.lower(), f"heard {text.strip()[:80]!r} in {time.time() - t0:.1f}s")
    except Exception as e:  # noqa: BLE001
        report(f"Listening ({s.stt_provider})", False, str(e)[:300])

    # 4. Telnyx
    try:
        r = requests.get(f"{s.telnyx_base_url}/phone_numbers", params={"filter[phone_number]": s.telnyx_phone_number},
                         headers={"Authorization": f"Bearer {s.telnyx_api_key}"}, timeout=20)
        data = (r.json().get("data") or []) if r.status_code == 200 else []
        if data:
            d = data[0]
            report("Telnyx number", True, f"{d['phone_number']} status={d.get('status')} connection_id={d.get('connection_id')}")
        else:
            report("Telnyx number", False, f"HTTP {r.status_code} {r.text[:200]}")
    except Exception as e:  # noqa: BLE001
        report("Telnyx number", False, str(e)[:300])

    # 5. Email
    if args.send_email:
        rec = {"channel": "test", "caller": "+15550000000", "duration": 1, "end_reason": "live_check", "company": "Live check",
               "transcript": [{"role": "user", "text": "This is a test"}],
               "lead": {"name": "Test Lead", "email": "test@example.com", "outcome": "lead", "summary": "Live check email from voice-sales-agent."}}
        status = await asyncio.to_thread(Notifier(s).send, rec)
        report("Lead email", any(v == "sent" for v in status.values()), f"{status} -> {s.lead_email_to}")

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--send-email", action="store_true")
    raise SystemExit(asyncio.run(main_async(ap.parse_args())))
