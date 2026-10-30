"""Settings, read from environment variables (and .env)."""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
if not os.environ.get("VSA_NO_DOTENV"):  # tests set this so they never read real credentials
    load_dotenv(ROOT / ".env")


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def _bool(key: str, default: bool = False) -> bool:
    v = _env(key, "")
    if not v:
        return default
    return v.lower() in ("1", "true", "yes", "on")


def _float(key: str, default: float) -> float:
    try:
        return float(_env(key, str(default)))
    except ValueError:
        return default


def _list(key: str, default: str = "") -> list[str]:
    return [x.strip() for x in _env(key, default).split(",") if x.strip()]


@dataclass
class Settings:
    # --- server
    public_base_url: str
    admin_token: str
    allowed_origins: list[str]
    data_dir: Path
    business_config: Path
    engine: str  # "pipeline" (STT->LLM->TTS) or "s2s" (huggingface/speech-to-speech server)
    mock_mode: bool
    realtime_pacing: bool

    # --- telnyx
    telnyx_api_key: str
    telnyx_phone_number: str
    telnyx_connection_id: str
    telnyx_public_key: str
    telnyx_base_url: str

    # --- LLM (OpenRouter)
    openrouter_api_key: str
    openrouter_base_url: str
    llm_model: str
    llm_fallback_models: list[str]

    # --- TTS (Fish Audio S2.1 Pro via OpenRouter, or Fish API directly)
    tts_provider: str  # openrouter | fish | edge
    tts_voice: str
    tts_model: str
    tts_format: str  # mp3 | pcm
    tts_pcm_rate: int
    fish_api_key: str
    fish_base_url: str

    # --- STT
    stt_provider: str  # hf | fish | local
    stt_model: str
    hf_token: str
    hf_base_url: str

    # --- speech-to-speech server (optional engine)
    s2s_url: str
    s2s_rate: int

    # --- platform (multi-tenant bridge)
    platform_base_url: str
    voice_webhook_secret: str

    # --- VAD / call behaviour
    vad_threshold: float
    vad_end_ms: int
    idle_prompt_s: float
    max_call_s: float

    # --- lead notification
    lead_email_to: str
    email_from: str
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_pass: str
    smtp_security: str  # starttls | ssl | none
    n8n_webhook_url: str
    email_empty_calls: bool

    @classmethod
    def load(cls) -> "Settings":
        tts_provider = _env("TTS_PROVIDER", "openrouter").lower()
        default_tts_model = "fish-audio/s2.1-pro" if tts_provider == "fish" else "fish-audio/s2.1-pro-free"
        return cls(
            public_base_url=_env("PUBLIC_BASE_URL", os.environ.get("RENDER_EXTERNAL_URL", "")).rstrip("/"),
            admin_token=_env("ADMIN_TOKEN", "change-me"),
            allowed_origins=_list("ALLOWED_ORIGINS", "*"),
            data_dir=Path(_env("DATA_DIR", str(ROOT / "data"))),
            business_config=Path(_env("BUSINESS_CONFIG", str(ROOT / "config" / "business.yaml"))),
            engine=_env("ENGINE", "pipeline").lower(),
            mock_mode=_bool("MOCK_MODE"),
            realtime_pacing=_bool("REALTIME_PACING", True),
            telnyx_api_key=_env("TELNYX_API_KEY"),
            telnyx_phone_number=_env("TELNYX_PHONE_NUMBER"),
            telnyx_connection_id=_env("TELNYX_CONNECTION_ID"),
            telnyx_public_key=_env("TELNYX_PUBLIC_KEY"),
            telnyx_base_url=_env("TELNYX_BASE_URL", "https://api.telnyx.com/v2").rstrip("/"),
            openrouter_api_key=_env("OPENROUTER_API_KEY"),
            openrouter_base_url=_env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/"),
            llm_model=_env("LLM_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
            llm_fallback_models=_list(
                "LLM_FALLBACK_MODELS", "google/gemma-3-27b-it:free,openai/gpt-oss-20b:free"
            ),
            tts_provider=tts_provider,
            tts_voice=_env("TTS_VOICE", "en-US-AvaNeural"),
            tts_model=_env("TTS_MODEL", default_tts_model),
            tts_format=_env("TTS_FORMAT", "mp3").lower(),
            tts_pcm_rate=int(_float("TTS_PCM_RATE", 44100)),
            fish_api_key=_env("FISH_API_KEY"),
            fish_base_url=_env("FISH_BASE_URL", "https://api.fish.audio/compat/api/v1").rstrip("/"),
            stt_provider=_env("STT_PROVIDER", "hf").lower(),
            stt_model=_env("STT_MODEL", "openai/whisper-large-v3-turbo"),
            hf_token=_env("HF_TOKEN"),
            hf_base_url=_env("HF_BASE_URL", "https://router.huggingface.co/hf-inference/models").rstrip("/"),
            platform_base_url=_env("PLATFORM_BASE_URL").rstrip("/"),
            voice_webhook_secret=_env("VOICE_WEBHOOK_SECRET"),
            s2s_url=_env("S2S_URL", "ws://localhost:8765/v1/realtime"),
            s2s_rate=int(_float("S2S_RATE", 24000)),
            vad_threshold=_float("VAD_THRESHOLD", 400.0),
            vad_end_ms=int(_float("VAD_END_MS", 700)),
            idle_prompt_s=_float("IDLE_PROMPT_S", 12.0),
            max_call_s=_float("MAX_CALL_S", 900.0),
            lead_email_to=_env("LEAD_EMAIL_TO", "junaidalani2001@gmail.com"),
            email_from=_env("EMAIL_FROM"),
            smtp_host=_env("SMTP_HOST", "smtp.gmail.com"),
            smtp_port=int(_float("SMTP_PORT", 587)),
            smtp_user=_env("SMTP_USER"),
            smtp_pass=_env("SMTP_PASS"),
            smtp_security=_env("SMTP_SECURITY", "starttls").lower(),
            n8n_webhook_url=_env("N8N_WEBHOOK_URL"),
            email_empty_calls=_bool("EMAIL_EMPTY_CALLS", False),
        )

    # -- derived -----------------------------------------------------------
    @property
    def ws_secret(self) -> str:
        """Deterministic token that Telnyx passes back on the media websocket URL."""
        seed = (self.telnyx_api_key or self.admin_token) + "|media-ws"
        return hashlib.sha256(seed.encode()).hexdigest()[:32]

    @property
    def media_ws_url(self) -> str:
        base = self.public_base_url
        if base.startswith("https://"):
            base = "wss://" + base[len("https://"):]
        elif base.startswith("http://"):
            base = "ws://" + base[len("http://"):]
        return f"{base}/telnyx/media?token={self.ws_secret}"

    @property
    def webhook_url(self) -> str:
        return f"{self.public_base_url}/telnyx/webhook"
