"""Settings: one small file (agent.yaml) + optional environment variables.

Precedence for every value:  environment variable  >  agent.yaml  >  built-in default.

Buyers only edit agent.yaml. To change a provider, change the ``provider:`` word and the ``model:``;
the API key is looked up by provider name in the ``keys:`` block.
"""
from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
if not os.environ.get("VSA_NO_DOTENV"):  # tests set this so they never read real credentials
    load_dotenv(ROOT / ".env")


class ConfigError(RuntimeError):
    pass


# --------------------------------------------------------------------------- presets
# provider -> (base_url, key name in the keys: block)
LLM_PRESETS = {
    "openrouter": ("https://openrouter.ai/api/v1", "openrouter"),
    "openai": ("https://api.openai.com/v1", "openai"),
    "groq": ("https://api.groq.com/openai/v1", "groq"),
    "together": ("https://api.together.xyz/v1", "together"),
    "mistral": ("https://api.mistral.ai/v1", "mistral"),
    "deepseek": ("https://api.deepseek.com/v1", "deepseek"),
    "ollama": ("http://localhost:11434/v1", None),  # local, no key
    "custom": ("", "custom"),  # any OpenAI-compatible server: set base_url
}
TTS_PRESETS = {
    "openrouter": ("https://openrouter.ai/api/v1", "openrouter"),
    "fish": ("https://api.fish.audio/compat/api/v1", "fish"),
    "openai": ("https://api.openai.com/v1", "openai"),
    "elevenlabs": ("https://api.elevenlabs.io", "elevenlabs"),
    "custom": ("", "custom"),  # any OpenAI-compatible /audio/speech server
}
STT_PRESETS = {
    "hf": ("https://router.huggingface.co/hf-inference/models", "huggingface"),
    "openai": ("https://api.openai.com/v1", "openai"),
    "groq": ("https://api.groq.com/openai/v1", "groq"),
    "fish": ("https://api.fish.audio/compat/api/v1", "fish"),
    "custom": ("", "custom"),  # any OpenAI-compatible /audio/transcriptions server
}
DEFAULT_MODELS = {
    ("llm", "openrouter"): "meta-llama/llama-3.3-70b-instruct:free",
    ("llm", "openai"): "gpt-4o-mini",
    ("llm", "groq"): "llama-3.3-70b-versatile",
    ("llm", "together"): "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    ("llm", "mistral"): "mistral-small-latest",
    ("llm", "deepseek"): "deepseek-chat",
    ("llm", "ollama"): "llama3.1",
    ("tts", "openrouter"): "fish-audio/s2.1-pro-free",
    ("tts", "fish"): "fish-audio/s2.1-pro",
    ("tts", "openai"): "gpt-4o-mini-tts",
    ("tts", "elevenlabs"): "eleven_turbo_v2_5",
    ("stt", "hf"): "openai/whisper-large-v3-turbo",
    ("stt", "openai"): "whisper-1",
    ("stt", "groq"): "whisper-large-v3-turbo",
    ("stt", "fish"): "fish-audio/transcribe-1",
}
DEFAULT_VOICES = {"openai": "alloy", "elevenlabs": "21m00Tcm4TlvDq8ikWAM"}
KEY_ENV = {
    "openrouter": "OPENROUTER_API_KEY", "openai": "OPENAI_API_KEY", "groq": "GROQ_API_KEY",
    "together": "TOGETHER_API_KEY", "mistral": "MISTRAL_API_KEY", "deepseek": "DEEPSEEK_API_KEY",
    "fish": "FISH_API_KEY", "elevenlabs": "ELEVENLABS_API_KEY", "huggingface": "HF_TOKEN",
    "telnyx": "TELNYX_API_KEY", "resend": "RESEND_API_KEY",
}
ALIASES = {"huggingface": "hf", "fishaudio": "fish", "eleven": "elevenlabs", "eleven_labs": "elevenlabs",
           "oai": "openai", "open_router": "openrouter", "local": "ollama"}


def _norm(p: str) -> str:
    p = (p or "").strip().lower().replace(" ", "")
    return ALIASES.get(p, p)


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def _truthy(v: str, default: bool = False) -> bool:
    v = (v or "").strip().lower()
    return default if not v else v in ("1", "true", "yes", "on")


def _read_yaml(path: Path) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}
    except yaml.YAMLError as e:
        raise ConfigError(f"{path.name} is not valid YAML (check indentation and quotes): {e}") from e
    if not isinstance(data, dict):
        raise ConfigError(f"{path.name} must contain key: value settings at the top level")
    return data


def _dig(d: dict, *path):
    for p in path:
        if not isinstance(d, dict):
            return None
        d = d.get(p)
    return d


@dataclass
class Settings:
    config_path: Path
    # --- server
    public_base_url: str
    admin_token: str
    allowed_origins: list[str]
    data_dir: Path
    engine: str  # "pipeline" (STT -> LLM -> TTS) or "s2s" (huggingface/speech-to-speech server)
    mock_mode: bool
    realtime_pacing: bool

    # --- telnyx
    telnyx_api_key: str
    telnyx_phone_number: str
    telnyx_connection_id: str
    telnyx_public_key: str
    telnyx_base_url: str

    # --- LLM
    llm_provider: str
    llm_base_url: str
    llm_api_key: str
    llm_model: str
    llm_fallback_models: list[str]

    # --- voice (TTS)
    tts_provider: str
    tts_base_url: str
    tts_api_key: str
    tts_model: str
    tts_voice: str
    tts_format: str  # mp3 | pcm (OpenAI-compatible providers only)
    tts_pcm_rate: int

    # --- listening (STT)
    stt_provider: str
    stt_base_url: str
    stt_api_key: str
    stt_model: str

    # --- speech-to-speech server (optional engine)
    s2s_url: str
    s2s_rate: int

    # --- VAD / call behaviour
    vad_threshold: float
    vad_end_ms: int
    idle_prompt_s: float
    max_call_s: float

    # --- lead notification
    lead_email_to: str
    email_from: str
    email_method: str  # auto | smtp | resend | n8n
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_pass: str
    smtp_security: str  # starttls | ssl | none
    n8n_webhook_url: str
    resend_api_key: str
    resend_base_url: str
    email_empty_calls: bool

    # ------------------------------------------------------------------ loading
    @classmethod
    def load(cls, config_path: Path | str | None = None) -> "Settings":
        path = Path(config_path or _env("AGENT_CONFIG") or ROOT / "agent.yaml")
        raw = _read_yaml(path)

        def pick(env_key: str, *ypath: str, default: str = "") -> str:
            v = _env(env_key) if env_key else ""
            if v:
                return v
            yv = _dig(raw, *ypath)
            if yv is None or str(yv).strip() == "":
                return default
            return str(yv).strip()

        def pick_list(env_key: str, *ypath: str, default: str = "") -> list[str]:
            v = _env(env_key) if env_key else ""
            if v:
                return [x.strip() for x in v.split(",") if x.strip()]
            yv = _dig(raw, *ypath)
            if isinstance(yv, list):
                return [str(x).strip() for x in yv if str(x).strip()]
            if isinstance(yv, str) and yv.strip():
                return [x.strip() for x in yv.split(",") if x.strip()]
            return [x.strip() for x in default.split(",") if x.strip()]

        def num(env_key: str, *ypath: str, default: float) -> float:
            try:
                return float(pick(env_key, *ypath, default=str(default)))
            except ValueError:
                return default

        def key_for(keyname: str | None, section_env: str, *section_path: str) -> str:
            """section override env > section api_key in yaml > provider env var > keys: block."""
            if section_env and _env(section_env):
                return _env(section_env)
            sec = _dig(raw, *section_path) if section_path else None
            if sec and str(sec).strip():
                return str(sec).strip()
            if keyname:
                if _env(KEY_ENV.get(keyname, "")):
                    return _env(KEY_ENV[keyname])
                kv = _dig(raw, "keys", keyname)
                if kv and str(kv).strip():
                    return str(kv).strip()
            return ""

        def resolve(kind: str, presets: dict, section: str, env_p: str, default_provider: str):
            provider = _norm(pick(f"{env_p}_PROVIDER", section, "provider", default=default_provider))
            preset_url, keyname = presets.get(provider, ("", provider))
            base = pick(f"{env_p}_BASE_URL", section, "base_url", default=preset_url).rstrip("/")
            key = key_for(keyname, f"{env_p}_API_KEY", section, "api_key")
            model = pick(f"{env_p}_MODEL", section, "model", default=DEFAULT_MODELS.get((kind, provider), ""))
            return provider, base, key, model

        llm_provider, llm_base, llm_key, llm_model = resolve("llm", LLM_PRESETS, "llm", "LLM", "openrouter")
        tts_provider, tts_base, tts_key, tts_model = resolve("tts", TTS_PRESETS, "voice", "TTS", "openrouter")
        stt_provider, stt_base, stt_key, stt_model = resolve("stt", STT_PRESETS, "listening", "STT", "hf")

        smtp_host = pick("SMTP_HOST", "email", "smtp_host", default="smtp.gmail.com")
        smtp_pass = pick("SMTP_PASS", "email", "smtp_password")
        if smtp_host.lower().endswith(("gmail.com", "googlemail.com")):
            smtp_pass = re.sub(r"\s+", "", smtp_pass)  # Google shows app passwords as 'abcd efgh ijkl mnop'

        origins = pick_list("ALLOWED_ORIGINS", "server", "allowed_origins", default="*")

        return cls(
            config_path=path,
            public_base_url=pick("PUBLIC_BASE_URL", "server", "public_url").rstrip("/"),
            admin_token=pick("ADMIN_TOKEN", "server", "admin_token", default="change-me"),
            allowed_origins=origins,
            data_dir=Path(pick("DATA_DIR", "server", "data_dir", default=str(ROOT / "data"))),
            engine=pick("ENGINE", "server", "engine", default="pipeline").lower(),
            mock_mode=_truthy(pick("MOCK_MODE", "server", "mock_mode")),
            realtime_pacing=_truthy(_env("REALTIME_PACING"), True),
            telnyx_api_key=key_for("telnyx", ""),
            telnyx_phone_number=pick("TELNYX_PHONE_NUMBER", "phone", "number"),
            telnyx_connection_id=pick("TELNYX_CONNECTION_ID", "phone", "connection_id"),
            telnyx_public_key=pick("TELNYX_PUBLIC_KEY", "phone", "public_key"),
            telnyx_base_url=pick("TELNYX_BASE_URL", default="https://api.telnyx.com/v2").rstrip("/"),
            llm_provider=llm_provider, llm_base_url=llm_base, llm_api_key=llm_key, llm_model=llm_model,
            llm_fallback_models=pick_list(
                "LLM_FALLBACK_MODELS", "llm", "fallback_models",
                default="google/gemma-3-27b-it:free,openai/gpt-oss-20b:free" if llm_provider == "openrouter" else "",
            ),
            tts_provider=tts_provider, tts_base_url=tts_base, tts_api_key=tts_key, tts_model=tts_model,
            tts_voice=pick("TTS_VOICE", "voice", "voice", default=DEFAULT_VOICES.get(tts_provider, "")),
            tts_format=pick("TTS_FORMAT", "voice", "format", default="mp3").lower(),
            tts_pcm_rate=int(num("TTS_PCM_RATE", "voice", "pcm_rate", default=44100)),
            stt_provider=stt_provider, stt_base_url=stt_base, stt_api_key=stt_key, stt_model=stt_model,
            s2s_url=pick("S2S_URL", "server", "s2s_url", default="ws://localhost:8765/v1/realtime"),
            s2s_rate=int(num("S2S_RATE", "server", "s2s_rate", default=24000)),
            vad_threshold=num("VAD_THRESHOLD", "advanced", "vad_threshold", default=400.0),
            vad_end_ms=int(num("VAD_END_MS", "advanced", "vad_end_ms", default=700)),
            idle_prompt_s=num("IDLE_PROMPT_S", "advanced", "idle_prompt_s", default=12.0),
            max_call_s=num("MAX_CALL_S", "advanced", "max_call_s", default=900.0),
            lead_email_to=pick("LEAD_EMAIL_TO", "email", "send_leads_to"),
            email_from=pick("EMAIL_FROM", "email", "from"),
            email_method=pick("EMAIL_METHOD", "email", "method", default="auto").lower(),
            smtp_host=smtp_host,
            smtp_port=int(num("SMTP_PORT", "email", "smtp_port", default=587)),
            smtp_user=pick("SMTP_USER", "email", "smtp_user"),
            smtp_pass=smtp_pass,
            smtp_security=pick("SMTP_SECURITY", "email", "smtp_security", default="starttls").lower(),
            n8n_webhook_url=pick("N8N_WEBHOOK_URL", "email", "n8n_webhook_url"),
            resend_api_key=key_for("resend", ""),
            resend_base_url=pick("RESEND_BASE_URL", default="https://api.resend.com").rstrip("/"),
            email_empty_calls=_truthy(pick("EMAIL_EMPTY_CALLS", "email", "email_empty_calls")),
        )

    # ------------------------------------------------------------------ derived
    @property
    def smtp_login(self) -> str:
        """SMTP username. If only an app password was given for Gmail, the Gmail address that gets the leads is the login."""
        if self.smtp_user:
            return self.smtp_user
        if self.smtp_pass and self.smtp_host.lower().endswith(("gmail.com", "googlemail.com")):
            return self.lead_email_to
        return ""

    @property
    def smtp_configured(self) -> bool:
        return bool((self.smtp_login and self.smtp_pass) or self.smtp_security == "none")

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

    def summary(self) -> dict:
        """Safe to show: which providers and models are active (never keys)."""
        return {
            "llm": f"{self.llm_provider}:{self.llm_model}",
            "voice": f"{self.tts_provider}:{self.tts_model}",
            "listening": f"{self.stt_provider}:{self.stt_model}",
            "email": self.email_method,
        }


# ---------------------------------------------------------------------- validation
def _needs_key(presets: dict, provider: str) -> bool:
    return provider not in presets or presets[provider][1] is not None


def problems(s: Settings) -> list[tuple[str, str]]:
    """Plain-English list of (level, message). level is 'error', 'warning' or 'info'."""
    out: list[tuple[str, str]] = []
    if s.mock_mode:
        return [("info", "mock_mode is on: scripted fake AI, no providers are used.")]

    def check(kind_label: str, section: str, presets: dict, provider: str, key: str, base: str, model: str, env_hint: str):
        if provider not in presets:
            out.append(("error", f"{section}.provider '{provider}' is not supported. Choose one of: {', '.join(presets)}."))
            return
        if provider == "custom" and not base:
            out.append(("error", f"{section}.provider is 'custom' so {section}.base_url is required (e.g. https://my-server/v1)."))
        if not model:
            out.append(("error", f"{section}.model is empty. Set the model name for {kind_label}."))
        if _needs_key(presets, provider) and not key:
            kn = presets[provider][1]
            out.append(("error", f"{kind_label}: provider '{provider}' needs an API key. Put it under keys.{kn} in agent.yaml (or set {env_hint})."))

    check("the AI brain (llm)", "llm", LLM_PRESETS, s.llm_provider, s.llm_api_key, s.llm_base_url, s.llm_model,
          KEY_ENV.get(LLM_PRESETS.get(s.llm_provider, ("", ""))[1] or "", "LLM_API_KEY") or "LLM_API_KEY")
    if s.engine == "s2s":
        out.append(("info", f"engine is 's2s': voice and listening are handled by the speech-to-speech server at {s.s2s_url}."))
    else:
        check("the voice (text-to-speech)", "voice", TTS_PRESETS, s.tts_provider, s.tts_api_key, s.tts_base_url, s.tts_model,
              KEY_ENV.get(TTS_PRESETS.get(s.tts_provider, ("", ""))[1] or "", "TTS_API_KEY") or "TTS_API_KEY")
        check("listening (speech-to-text)", "listening", STT_PRESETS, s.stt_provider, s.stt_api_key, s.stt_base_url, s.stt_model,
              KEY_ENV.get(STT_PRESETS.get(s.stt_provider, ("", ""))[1] or "", "STT_API_KEY") or "STT_API_KEY")

    if not s.telnyx_api_key or not s.telnyx_phone_number:
        out.append(("warning", "Phone is not set up (keys.telnyx and phone.number). The website widget will still work."))
    if not s.public_base_url:
        out.append(("warning", "server.public_url is empty. Phone calls need a public https address (see README)."))
    if s.admin_token in ("change-me", "change-me-to-a-long-random-string", ""):
        out.append(("warning", "server.admin_token is still the default. Set a long random value before going live."))

    if not s.lead_email_to:
        out.append(("error", "email.send_leads_to is empty: nobody would receive the leads."))
    if s.email_method not in ("auto", "smtp", "resend", "n8n"):
        out.append(("error", f"email.method '{s.email_method}' is not supported. Choose: auto, smtp, resend, n8n."))
    if not (s.smtp_configured or s.resend_api_key or s.n8n_webhook_url):
        out.append(("warning", "No email sender is configured, so leads are only saved in data/outbox/. "
                               "Set email.smtp_password (Gmail app password), keys.resend, or email.n8n_webhook_url."))
    if s.smtp_pass and not s.smtp_user and s.smtp_login:
        out.append(("info", f"email.smtp_user is empty, so Gmail login '{s.smtp_login}' (email.send_leads_to) is used."))
    return out
