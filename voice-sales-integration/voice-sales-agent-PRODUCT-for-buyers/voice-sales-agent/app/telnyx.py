"""Telnyx Call Control REST client and webhook signature verification."""
from __future__ import annotations

import base64
import json
import logging
import time

import requests
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .config import Settings

log = logging.getLogger("telnyx")


class TelnyxError(RuntimeError):
    pass


class TelnyxClient:
    def __init__(self, s: Settings):
        self.s = s

    def _post(self, path: str, body: dict) -> dict:
        r = requests.post(
            f"{self.s.telnyx_base_url}{path}",
            headers={"Authorization": f"Bearer {self.s.telnyx_api_key}", "Content-Type": "application/json"},
            json=body,
            timeout=20,
        )
        if r.status_code >= 300:
            raise TelnyxError(f"POST {path} -> HTTP {r.status_code}: {r.text[:300]}")
        return r.json() if r.content else {}

    def answer(self, call_control_id: str) -> dict:
        return self._post(f"/calls/{call_control_id}/actions/answer", {})

    def streaming_start(self, call_control_id: str) -> dict:
        """Start bidirectional media streaming: mu-law 8 kHz both directions over our websocket."""
        return self._post(
            f"/calls/{call_control_id}/actions/streaming_start",
            {
                "stream_url": self.s.media_ws_url,
                "stream_track": "inbound_track",
                "stream_codec": "PCMU",
                "stream_bidirectional_mode": "rtp",
                "stream_bidirectional_codec": "PCMU",
                "stream_bidirectional_sampling_rate": 8000,
                "stream_bidirectional_target_legs": "opposite",
            },
        )

    def hangup(self, call_control_id: str) -> dict:
        return self._post(f"/calls/{call_control_id}/actions/hangup", {})

    def dial(self, to: str, client_state: dict | None = None) -> dict:
        body = {
            "connection_id": self.s.telnyx_connection_id,
            "to": to,
            "from": self.s.telnyx_phone_number,
            "webhook_url": self.s.webhook_url,
        }
        if client_state:
            body["client_state"] = base64.b64encode(json.dumps(client_state).encode()).decode()
        return self._post("/calls", body)


def verify_signature(public_key_b64: str, signature_b64: str, timestamp: str, body: bytes, tolerance_s: int = 300) -> bool:
    """Telnyx signs ``timestamp|body`` with ed25519 (headers telnyx-signature-ed25519 / telnyx-timestamp)."""
    try:
        if abs(time.time() - int(timestamp)) > tolerance_s:
            return False
        key = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key_b64))
        key.verify(base64.b64decode(signature_b64), timestamp.encode() + b"|" + body)
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False
