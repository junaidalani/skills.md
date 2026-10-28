"""Twilio carrier adapter: webhook signature verification, TwiML, REST hangup.

Twilio signs every webhook with ``X-Twilio-Signature`` = base64(HMAC-SHA1(auth_token,
full_url + sorted(key+value for each POST param))). The algorithm is checked against
Twilio's documented test vector in ``tests/test_carriers.py``.

Media is mu-law 8 kHz both ways, exactly like the Telnyx path, so the audio pipeline is
shared; only the JSON envelope differs (Twilio tags every frame with ``streamSid``).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging

import requests

from .config import Settings

log = logging.getLogger("twilio")

TWILIO_API = "https://api.twilio.com"


class TwilioError(RuntimeError):
    pass


def signature_for(auth_token: str, url: str, params: dict[str, str]) -> str:
    """The value Twilio puts in ``X-Twilio-Signature`` for this request."""
    data = url + "".join(k + v for k, v in sorted(params.items()))
    digest = hmac.new(auth_token.encode("utf-8"), data.encode("utf-8"), hashlib.sha1).digest()
    return base64.b64encode(digest).decode()


def verify_signature(auth_token: str, signature: str, url: str, params: dict[str, str]) -> bool:
    """Constant-time check of a Twilio webhook signature."""
    if not auth_token or not signature:
        return False
    return hmac.compare_digest(signature_for(auth_token, url, params), signature)


def twiml(stream_url: str, token: str, call_sid: str, caller: str = "", called: str = "") -> str:
    """TwiML that hands the call's audio to our websocket.

    Twilio's ``start`` event does not carry the phone numbers, so they ride along as
    custom parameters and are read back on the media socket.
    """
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response><Connect>"
        f'<Stream url="{_xml(stream_url)}">'
        f'<Parameter name="token" value="{_xml(token)}"/>'
        f'<Parameter name="callSid" value="{_xml(call_sid)}"/>'
        f'<Parameter name="from" value="{_xml(caller)}"/>'
        f'<Parameter name="to" value="{_xml(called)}"/>'
        "</Stream></Connect></Response>"
    )


def twiml_hangup(message: str) -> str:
    """TwiML that speaks one line and ends the call (unconfigured numbers)."""
    return (f'<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">{_xml(message)}</Say>'
            "<Hangup/></Response>")


def _xml(v: str) -> str:
    return (v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&apos;"))


class TwilioClient:
    """Minimal REST client. Authenticates with an API key when one is configured."""

    def __init__(self, s: Settings):
        self.s = s

    @property
    def auth(self) -> tuple[str, str]:
        if self.s.twilio_api_key_sid and self.s.twilio_api_key_secret:
            return self.s.twilio_api_key_sid, self.s.twilio_api_key_secret
        return self.s.twilio_account_sid, self.s.twilio_auth_token

    def _account(self) -> str:
        if not self.s.twilio_account_sid:
            raise TwilioError("TWILIO_ACCOUNT_SID (AC...) is not set; the REST path needs it")
        return self.s.twilio_account_sid

    def hangup(self, call_sid: str) -> dict:
        url = f"{TWILIO_API}/2010-04-01/Accounts/{self._account()}/Calls/{call_sid}.json"
        r = requests.post(url, auth=self.auth, data={"Status": "completed"}, timeout=20)
        if r.status_code >= 300:
            raise TwilioError(f"hangup {call_sid} -> HTTP {r.status_code}: {r.text[:300]}")
        return r.json() if r.content else {}

    def set_voice_webhook(self, phone_sid: str, url: str) -> dict:
        """Point a number's Voice URL at us (used by the connect-number flow)."""
        api = f"{TWILIO_API}/2010-04-01/Accounts/{self._account()}/IncomingPhoneNumbers/{phone_sid}.json"
        r = requests.post(api, auth=self.auth, data={"VoiceUrl": url, "VoiceMethod": "POST"}, timeout=20)
        if r.status_code >= 300:
            raise TwilioError(f"set webhook {phone_sid} -> HTTP {r.status_code}: {r.text[:300]}")
        return r.json() if r.content else {}

    def numbers(self) -> list[dict]:
        api = f"{TWILIO_API}/2010-04-01/Accounts/{self._account()}/IncomingPhoneNumbers.json"
        r = requests.get(api, auth=self.auth, timeout=20)
        if r.status_code >= 300:
            raise TwilioError(f"list numbers -> HTTP {r.status_code}: {r.text[:300]}")
        return r.json().get("incoming_phone_numbers", [])

    def probe(self) -> str:
        """Return '' when the credentials work, else a plain-English reason."""
        try:
            r = requests.get(f"{TWILIO_API}/2010-04-01/Accounts.json", auth=self.auth, timeout=20)
        except requests.RequestException as e:
            return f"network: {e}"
        if r.status_code == 200:
            return ""
        if r.status_code == 401:
            return ("Twilio rejected the credentials (401/70051). An API key needs its own secret "
                    "(SK... + secret) and the account SID (AC...) for the REST path.")
        return f"HTTP {r.status_code}: {r.text[:200]}"


def form_params(form) -> dict[str, str]:
    """Flatten a Starlette form into the dict Twilio signed."""
    return {k: str(v) for k, v in form.items()}
