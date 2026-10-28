"""Multi-tenancy: every call asks the platform site who the dialled number belongs to.

The site answers ``GET {TENANCY_URL}/api/voice/session-config?to=+1555...`` with that tenant's
business details, provider keys/models and actions (see src/app/api/voice/session-config).

With ``TENANCY_URL`` unset the service stays single-tenant and uses agent.yaml, exactly as before.
Answers are cached for a minute so a call start never waits on the site twice, and a site hiccup
falls back to the last good answer for that number.
"""
from __future__ import annotations

import asyncio
import dataclasses
import hashlib
import json
import logging
import re
import time

import requests

from .config import Settings
from .prompt import business_from_dict
from .providers import Providers, build_providers

log = logging.getLogger("tenancy")

TTL_S = 60.0
NEGATIVE_TTL_S = 30.0
TIMEOUT_S = 4.0


def normalize_number(raw: str | None) -> str:
    digits = re.sub(r"[^0-9+]", "", raw or "")
    return digits if digits.startswith("+") else ("+" + digits if digits else "")


@dataclasses.dataclass
class Tenant:
    id: str
    business: dict
    actions: list[dict]
    settings: Settings
    providers: Providers
    warnings: list[str]


def apply_config(base: Settings, payload: dict) -> Settings:
    """Overlay the tenant's providers/email on the platform settings. Missing pieces keep platform defaults."""
    over: dict = {}
    p = payload.get("providers") or {}
    llm, stt, tts = p.get("llm") or {}, p.get("stt") or {}, p.get("tts") or {}
    if llm.get("api_key"):
        over.update(llm_provider=llm.get("provider", "custom"), llm_base_url=llm.get("base_url", ""),
                    llm_api_key=llm["api_key"], llm_model=llm.get("model", ""), llm_fallback_models=[])
    if tts.get("api_key"):
        over.update(tts_provider=tts.get("provider", "custom"), tts_base_url=tts.get("base_url", ""),
                    tts_api_key=tts["api_key"], tts_model=tts.get("model", ""), tts_voice=tts.get("voice", ""))
        if tts.get("format"):
            over["tts_format"] = tts["format"]
    if stt.get("api_key"):
        over.update(stt_provider=stt.get("provider", "custom"), stt_base_url=stt.get("base_url", ""),
                    stt_api_key=stt["api_key"], stt_model=stt.get("model", ""))
    # Twilio is verifiable with the tenant's own auth token. A Telnyx number connected with the
    # workspace's own key is answered, streamed and hung up with that key too.
    tel = payload.get("telephony") or {}
    if tel.get("provider") == "twilio" and tel.get("auth_token"):
        over.update(twilio_account_sid=tel.get("account_sid", ""), twilio_auth_token=tel["auth_token"],
                    twilio_phone_number=tel.get("phone_number") or base.twilio_phone_number)
    elif tel.get("provider") == "telnyx" and tel.get("api_key"):
        over.update(telnyx_api_key=tel["api_key"],
                    telnyx_phone_number=tel.get("phone_number") or base.telnyx_phone_number,
                    telnyx_connection_id=tel.get("connection_id") or base.telnyx_connection_id)
    email = payload.get("email") or {}
    if email.get("to"):
        over["lead_email_to"] = email["to"]
    if email.get("resend_api_key"):
        over["resend_api_key"] = email["resend_api_key"]
    limits = payload.get("limits") or {}
    try:
        if limits.get("maxCallSeconds"):
            over["max_call_s"] = float(limits["maxCallSeconds"])
    except (TypeError, ValueError):
        pass  # a bad limit must not take the call down; the platform default stands
    return dataclasses.replace(base, **over)


class TenantRegistry:
    def __init__(self, base: Settings, url: str = "", secret: str = "", http=requests.get):
        self.base = base
        self.url = url.rstrip("/")
        self.secret = secret
        self.http = http
        self._cache: dict[str, tuple[float, Tenant | None]] = {}
        self._providers: dict[str, tuple[str, Providers]] = {}

    @property
    def enabled(self) -> bool:
        return bool(self.url)

    def _fetch(self, number: str) -> tuple[int, dict]:
        r = self.http(f"{self.url}/api/voice/session-config", params={"to": number},
                      headers={"Authorization": f"Bearer {self.secret}"}, timeout=TIMEOUT_S)
        try:
            body = r.json()
        except ValueError:
            body = {}
        return r.status_code, body if isinstance(body, dict) else {}

    def _build(self, payload: dict) -> Tenant:
        settings = apply_config(self.base, payload)
        fingerprint = hashlib.sha256(json.dumps(payload.get("providers") or {}, sort_keys=True).encode()).hexdigest()
        tenant_id = str(payload.get("tenantId") or "?")
        cached = self._providers.get(tenant_id)
        if cached and cached[0] == fingerprint:
            providers = cached[1]
        else:
            providers = build_providers(settings)  # raises ConfigError on a bad tenant config; caller handles
            self._providers[tenant_id] = (fingerprint, providers)
        business = business_from_dict(payload.get("business") or {})
        if payload.get("actions") and not business.get("actions"):
            business["actions"] = payload["actions"]
        return Tenant(tenant_id, business, list(payload.get("actions") or business.get("actions") or []),
                      settings, providers, list(payload.get("warnings") or []))

    async def resolve(self, to_number: str) -> Tenant | None:
        """Tenant for a dialled number, or None when the site says the number is unknown/inactive.
        Raises RuntimeError only when the site cannot be reached and nothing is cached."""
        if not self.enabled:
            return None
        number = normalize_number(to_number)
        if not number:
            return None
        hit = self._cache.get(number)
        if hit and hit[0] > time.monotonic():
            return hit[1]

        def work():
            try:
                return self._fetch(number)
            except requests.RequestException as e:
                return 0, {"error": f"{type(e).__name__}: {e}"}

        status, payload = await asyncio.to_thread(work)
        if status == 200:
            try:
                tenant = self._build(payload)
            except Exception as e:  # noqa: BLE001 - bad tenant config must not kill the process
                log.error("tenant %s config rejected: %s", payload.get("tenantId"), e)
                self._cache[number] = (time.monotonic() + NEGATIVE_TTL_S, None)
                return None
            self._cache[number] = (time.monotonic() + TTL_S, tenant)
            log.info("call for %s -> tenant %s (%s)", number, tenant.id, tenant.business.get("company"))
            return tenant
        if status in (403, 404, 409):
            log.warning("number %s refused by platform: %s", number, payload.get("error"))
            self._cache[number] = (time.monotonic() + NEGATIVE_TTL_S, None)
            return None
        # site down or misconfigured: keep serving the last good answer for this number
        stale = hit[1] if hit else None
        if stale:
            log.warning("tenant lookup failed (%s); using cached config", status or payload.get("error"))
            return stale
        raise RuntimeError(f"tenant lookup failed for {number}: {status or payload.get('error')}")
