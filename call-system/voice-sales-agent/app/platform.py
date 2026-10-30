"""Multi-tenant bridge: per-call configuration for a dialed number.

When PLATFORM_BASE_URL and VOICE_WEBHOOK_SECRET are set, every incoming call first
asks the platform website which tenant owns the dialed number, which business text
speaks on the call, and which provider keys to use (the tenant's own LLM/STT/TTS and
Telnyx). When the call ends the transcript, outcome and lead are reported back to
the platform, which stores calls, transcripts, leads and usage per tenant.

Platform contract (Bearer VOICE_WEBHOOK_SECRET on both sides):
    GET  {platform}/api/voice/session-config?to=+1555...   -> per-tenant config
    POST {platform}/api/voice/call-ended                   -> stores the call record
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from datetime import datetime, timezone

import requests

from .config import Settings
from .providers import FishCompatSTT, HFWhisperSTT, OpenAICompatTTS, OpenRouterLLM, Providers
from .telnyx import TelnyxClient

log = logging.getLogger("platform")

# Provider names the platform sends that speak the OpenAI chat/speech/transcriptions surface.
_OPENAI_COMPAT = {"openai", "groq", "deepseek", "openrouter", "custom", "openai_compatible"}


@dataclass
class TenantConfig:
    tenant_id: str
    settings: Settings
    providers: Providers          # slots may be None; the caller falls back to its defaults
    telnyx: TelnyxClient | None   # tenant's own Telnyx key (answer/hangup/streaming)
    business: dict
    actions: list
    warnings: list[str]


def _clip(text: object, n: int = 120) -> str:
    return str(text or "").strip()[:n]


def platform_ready(s: Settings) -> bool:
    return bool(s.platform_base_url and s.voice_webhook_secret)


def _call_cap(s: Settings, minutes_remaining: object) -> float:
    """Cap the call length to the tenant's remaining plan minutes (>= 30 s so the
    agent can say the plan is exhausted)."""
    try:
        minutes = float(minutes_remaining)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return s.max_call_s
    return max(30.0, min(s.max_call_s, minutes * 60.0))


def build_tenant_business(raw: dict) -> dict:
    """Map the platform's business dict onto the fields build_system_prompt reads."""
    company = _clip(raw.get("company"), 80) or "Our Company"
    biz = {
        "company": company,
        "agent_name": _clip(raw.get("agent_name"), 60) or "Assistant",
        "greeting": _clip(raw.get("greeting"), 300) or f"Thanks for calling {company}. How can I help you today?",
        "goodbye": _clip(raw.get("goodbye"), 200) or "Thanks for calling. Goodbye!",
        "personality": _clip(raw.get("personality"), 1000) or None,
        "about": _clip(raw.get("about"), 6000) or None,
        "business_hours": _clip(raw.get("business_hours"), 300) or None,
        "goal": _clip(raw.get("goal"), 1000) or "Help the caller and capture their details for a follow-up.",
        "collect": [str(x) for x in (raw.get("collect") or []) if str(x).strip()][:12] or
                   ["full name", "best phone number", "reason for calling"],
        "policies": [str(x) for x in (raw.get("policies") or []) if str(x).strip()][:12],
        "products": raw.get("products") if isinstance(raw.get("products"), list) else None,
        "faq": raw.get("faq") if isinstance(raw.get("faq"), list) else None,
    }
    return biz


def providers_for(s: Settings, cfg: dict, warnings: list[str], business: dict) -> Providers:
    """Build the tenant's provider objects; a slot stays None when the tenant brings
    nothing usable, in which case the caller falls back to the deployment defaults."""
    given = cfg.get("providers") or {}
    llm = stt = tts = None

    for kind, hook in given.items():
        if not isinstance(hook, dict):
            continue
        name = str(hook.get("provider") or "").lower()
        base = str(hook.get("base_url") or "").rstrip("/")
        model = str(hook.get("model") or "")
        api_key = str(hook.get("api_key") or "")
        try:
            if kind == "llm":
                if name in _OPENAI_COMPAT and base and api_key:
                    settings = replace(
                        s, openrouter_api_key=api_key, openrouter_base_url=base,
                        llm_model=model or s.llm_model, llm_fallback_models=[],
                    )
                    llm = OpenRouterLLM(settings)
                    continue
                warnings.append(f"{_clip(name)} is not supported for llm; the platform default is used.")
            elif kind == "stt":
                if api_key and (base or model):
                    if name == "hf":
                        stt = HFWhisperSTT(base or s.hf_base_url, api_key, model or s.stt_model)
                        continue
                    if name in _OPENAI_COMPAT:
                        stt = FishCompatSTT(base, api_key, model or "whisper-1")
                        continue
                warnings.append(f"{_clip(name)} is not supported for stt; the platform default is used.")
            elif kind == "tts":
                if name in _OPENAI_COMPAT and api_key and model:
                    tts = OpenAICompatTTS(
                        base, api_key, model,
                        voice=str(hook.get("voice") or ""), fmt=str(hook.get("format") or "mp3"), pcm_rate=44100,
                    )
                    continue
                warnings.append(f"{_clip(name)} is not supported for tts; the platform default is used.")
        except Exception as e:  # noqa: BLE001 - configuration must not crash the call
            warnings.append(f"{_clip(name)} {kind} setup failed: {type(e).__name__}: {e}")
    return Providers(stt=stt, llm=llm, tts=tts)


def fetch_session_config(s: Settings, to: str) -> TenantConfig | None:
    """Blocking network call: ask the platform who owns ``to``. Returns None when the
    platform is not configured, the number is unassigned, or the fetch fails — the
    caller then falls back to the local single-tenant setup."""
    if not platform_ready(s):
        return None
    try:
        r = requests.get(
            f"{s.platform_base_url}/api/voice/session-config",
            params={"to": to},
            headers={"Authorization": f"Bearer {s.voice_webhook_secret}"},
            timeout=15,
        )
        if r.status_code != 200:
            log.info("session-config %s -> HTTP %s", _clip(to), r.status_code)
            return None
        cfg = r.json()
    except Exception as e:  # noqa: BLE001 - a platform outage must not kill calls
        log.warning("session-config fetch failed: %s", e)
        return None

    warnings = [str(w) for w in (cfg.get("warnings") or [])]
    limits = cfg.get("limits") or {}
    settings = replace(s, max_call_s=_call_cap(s, limits.get("minutesRemaining")))
    business = build_tenant_business(cfg.get("business") or {})
    providers = providers_for(settings, cfg, warnings, business)

    telnyx_client = None
    telephony = cfg.get("telephony") or {}
    if str(telephony.get("provider") or "").lower() == "telnyx" and telephony.get("api_key"):
        telnyx_client = TelnyxClient(replace(settings, telnyx_api_key=str(telephony["api_key"])))
    elif telephony:
        warnings.append(f"{_clip(telephony.get('provider'))} telephony is not supported on this voice server.")

    if warnings:
        log.info("tenant %s call config warnings: %s", _clip(cfg.get("tenantId")), "; ".join(warnings))
    return TenantConfig(
        tenant_id=str(cfg.get("tenantId") or ""),
        settings=settings,
        providers=providers,
        telnyx=telnyx_client,
        business=business,
        actions=list(cfg.get("actions") or []),
        warnings=warnings,
    )


_PLATFORM_OUTCOMES = {"answered", "missed", "blocked", "failed", "transferred", "voicemail"}


def platform_outcome(rec: dict) -> str:
    """Map the agent's outcome onto the platform's allowed call outcomes."""
    call_outcome = str(rec.get("outcome") or "")
    spoke = any(t.get("role") == "user" for t in (rec.get("transcript") or []))
    if spoke:
        return "answered"
    if call_outcome in _PLATFORM_OUTCOMES:
        return call_outcome
    return "answered" if call_outcome == "lead" else "missed"


def call_ended_payload(cfg: TenantConfig, rec: dict) -> dict:
    """Build the POST /api/voice/call-ended body from the agent's call record."""
    started = float(rec.get("started") or 0)
    turns = [
        {
            # the agent records "assistant"; the platform stores per-turn roles as given
            "role": {"assistant": "agent"}.get(str(t.get("role")), str(t.get("role")) or "caller"),
            "text": str(t.get("text") or ""),
            "at": round(started + float(t.get("ts") or 0), 2),
        }
        for t in (rec.get("transcript") or [])
    ]
    lead = rec.get("lead") or {}
    return {
        "callId": str(rec.get("call_id") or ""),
        "to": str(rec.get("callee") or ""),
        "from": str(rec.get("caller") or ""),
        # ISO 8601: the platform parses these with Date.parse
        "startedAt": datetime.fromtimestamp(started, timezone.utc).isoformat(),
        "endedAt": datetime.fromtimestamp(float(rec.get("ended") or 0), timezone.utc).isoformat(),
        "durationSeconds": int(float(rec.get("duration") or 0)),
        "outcome": platform_outcome(rec),
        "summary": str(rec.get("summary") or "")[:1200],
        "turns": turns,
        "lead": {
            "name": lead.get("name"), "phone": lead.get("phone"), "email": lead.get("email"),
            "reason": str(lead.get("interest") or lead.get("reason") or "")[:500],
            "fields": {k: v for k, v in (lead or {}).items()
                       if k not in ("name", "phone", "email", "interest", "reason", "summary", "outcome")},
        },
    }


def report_call_ended(s: Settings, cfg: TenantConfig, rec: dict) -> bool:
    """Blocking network call: push the call record to the platform (fire-and-forget)."""
    payload = call_ended_payload(cfg, rec)
    try:
        r = requests.post(
            f"{s.platform_base_url}/api/voice/call-ended",
            headers={"Authorization": f"Bearer {s.voice_webhook_secret}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        if r.status_code >= 300:
            log.warning("call-ended report -> HTTP %s: %s", r.status_code, _clip(r.text, 300))
            return False
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("call-ended report failed: %s", e)
        return False


__all__ = [
    "TenantConfig", "platform_ready", "build_tenant_business", "providers_for",
    "fetch_session_config", "call_ended_payload", "report_call_ended",
]
