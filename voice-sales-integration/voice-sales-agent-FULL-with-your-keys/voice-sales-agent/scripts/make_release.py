#!/usr/bin/env python3
"""Build the zip you SELL: the whole product with no secrets and a blank agent.yaml for the buyer to fill in.

    python scripts/make_release.py        # writes dist/voice-sales-agent-product.zip and dist/agent.yaml
"""
from __future__ import annotations

import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import make_buyer_kit  # noqa: E402

SKIP_DIRS = {".venv", "__pycache__", ".git", "data", "out", "dist", "buyer-kit", "vendor"}
SKIP_FILES = {".env", "voice-sales-agent.zip"}


def build(out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    kit_yaml = make_buyer_kit.make(ROOT / "agent.yaml", tmp)
    (out_dir / "agent.yaml").write_text(kit_yaml.read_text(encoding="utf-8"), encoding="utf-8")
    zpath = out_dir / "voice-sales-agent-product.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for path in sorted(ROOT.rglob("*")):
            rel = path.relative_to(ROOT)
            if path.is_dir() or any(p in SKIP_DIRS for p in rel.parts) or rel.name in SKIP_FILES:
                continue
            if rel.as_posix() == "agent.yaml":
                z.write(kit_yaml, "voice-sales-agent/agent.yaml")
            else:
                z.write(path, f"voice-sales-agent/{rel.as_posix()}")
        z.writestr("voice-sales-agent/data/.gitkeep", "")
    return zpath, out_dir / "agent.yaml"


if __name__ == "__main__":
    z, y = build(ROOT / "dist")
    print(f"Wrote {z}\nWrote {y}")
