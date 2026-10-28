"""HTTP + websocket server (Starlette)."""
from __future__ import annotations

import asyncio
import base64
import hmac
import json
import logging
import re
import time
from dataclasses import replace as dc_replace
from datetime import datetime, timezone

import requests
from collections import defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, PlainTextResponse
from starlette.routing import Route, WebSocketRoute
from starlette.websockets import WebSocket, WebSocketDisconnect

from .actions import ActionRunner
from .audio import Up2, pcm_array, ulaw_decode, ulaw_encode
from .carriers import TwilioClient, form_params, twiml, twiml_hangup, verify_signature as verify_twilio
from .config import ROOT, Settings
from .leads import EMAIL_RE, Notifier, Store, clean_lead, extract_lead
from .prompt import load_business
from .providers import Providers, build_providers
from .s2s import S2SSession
from .session import VoiceSession
from .telnyx import TelnyxClient, verify_signature
from .tenancy import TenantRegistry

log = logging.getLogger("app")
WEB_DIR = ROOT / "web"
E164 = re.compile(r"^\+[1-9]\d{7,14}$")
NO_TENANT_LINE = "Sorry, this number is not in service. Please check the number and try again. Goodbye."


@dataclass
class Ctx:
    settings: Settings
    providers: Providers
    store: Store
    notifier: Notifier
    telnyx: TelnyxClient
    twilio: TwilioClient
    business: dict
    tenancy: TenantRegistry | None = None
    streaming_started: set = field(default_factory=set)
    tasks: set = field(default_factory=set)
    form_hits: dict = field(default_factory=lambda: defaultdict(deque))

    def spawn(self, coro) -> None:
        t = asyncio.create_task(coro)
        self.tasks.add(t)

        def done(task: asyncio.Task) -> None:
            self.tasks.discard(task)
            if not task.cancelled() and task.exception():
                log.error("background task failed: %r", task.exception())

        t.add_done_callback(done)

    def spawn_blocking(self, fn, *args) -> None:
        self.spawn(asyncio.to_thread(fn, *args))


# --------------------------------------------------------------- transports
class _SafeSend:
    async def _text(self, ws: WebSocket, obj: dict) -> None:
        try:
            await ws.send_text(json.dumps(obj))
        except Exception:  # noqa: BLE001 - socket may already be closed
            pass


class TelnyxTransport(_SafeSend):
    out_rate = 8000

    def __init__(self, ws: WebSocket, ctx: Ctx, call_control_id: str | None):
        self.ws, self.ctx, self.cc = ws, ctx, call_control_id

    async def send_audio(self, pcm16: bytes) -> None:
        payload = base64.b64encode(ulaw_encode(pcm_array(pcm16))).decode()
        await self._text(self.ws, {"event": "media", "media": {"payload": payload}})

    async def clear(self) -> None:
        await self._text(self.ws, {"event": "clear"})

    async def send_event(self, ev: dict) -> None:
        return None

    async def hangup(self) -> None:
        if self.cc and self.ctx.settings.telnyx_api_key:
            await asyncio.to_thread(self.ctx.telnyx.hangup, self.cc)


class TwilioTransport(_SafeSend):
    """Twilio Media Streams: same mu-law 8 kHz audio, but every frame carries the streamSid."""

    out_rate = 8000

    def __init__(self, ws: WebSocket, ctx: Ctx, stream_sid: str | None, call_sid: str | None):
        self.ws, self.ctx, self.stream_sid, self.call_sid = ws, ctx, stream_sid, call_sid

    async def send_audio(self, pcm16: bytes) -> None:
        payload = base64.b64encode(ulaw_encode(pcm_array(pcm16))).decode()
        await self._text(self.ws, {"event": "media", "streamSid": self.stream_sid, "media": {"payload": payload}})

    async def clear(self) -> None:
        await self._text(self.ws, {"event": "clear", "streamSid": self.stream_sid})

    async def send_event(self, ev: dict) -> None:
        return None

    async def hangup(self) -> None:
        if self.call_sid and self.ctx.settings.twilio_account_sid:
            await asyncio.to_thread(self.ctx.twilio.hangup, self.call_sid)


class WebTransport(_SafeSend):
    out_rate = 24000

    def __init__(self, ws: WebSocket, muted: bool = False):
        self.ws, self.muted = ws, muted

    async def send_audio(self, pcm16: bytes) -> None:
        if self.muted:
            return
        try:
            await self.ws.send_bytes(pcm16)
        except Exception:  # noqa: BLE001
            pass

    async def clear(self) -> None:
        await self._text(self.ws, {"type": "clear"})

    async def send_event(self, ev: dict) -> None:
        await self._text(self.ws, ev)

    async def hangup(self) -> None:
        await self._text(self.ws, {"type": "end"})


# ------------------------------------------------------------------ helpers
async def finalize_call(ctx: Ctx, result: dict) -> dict:
    """Extract lead data, store the call and email it. Runs after every call."""
    turns = result.get("transcript") or []
    lead = await extract_lead(ctx.providers.llm, turns, result.get("caller"))
    rec = {**result, "company": ctx.business.get("company"), "lead": lead,
           "summary": lead["summary"], "outcome": lead["outcome"]}
    spoke = any(t["role"] == "user" for t in turns)
    rec["notify"] = (
        await asyncio.to_thread(ctx.notifier.send, rec) if (spoke or ctx.settings.email_empty_calls) else {"skipped": "no caller speech"}
    )
    rec["id"] = ctx.store.save(rec)
    rec["site"] = await asyncio.to_thread(post_to_site, ctx.settings, rec)
    log.info("call %s finalized: outcome=%s notify=%s site=%s", rec["id"], rec["outcome"], rec["notify"], rec["site"])
    return rec


def post_to_site(s: Settings, rec: dict) -> dict:
    """Push the finished call to the platform site so the tenant dashboard shows it. Blocking; never raises."""
    if not (s.site_url and s.site_secret):
        return {"skipped": "no platform url"}
    iso = lambda ts: datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()  # noqa: E731
    lead = rec.get("lead") or {}
    body = {
        "callId": rec.get("call_id"), "to": rec.get("callee"), "from": rec.get("caller"),
        "startedAt": iso(rec.get("started") or time.time()), "endedAt": iso(rec.get("ended") or time.time()),
        "durationSeconds": rec.get("duration") or 0, "outcome": "answered", "summary": lead.get("summary"),
        "turns": [{"role": t["role"], "text": t["text"]} for t in rec.get("transcript") or []],
        "lead": {"name": lead.get("name"), "phone": lead.get("phone"), "email": lead.get("email"),
                 "reason": lead.get("interest") or lead.get("request_type"),
                 "fields": {"next_step": lead.get("next_step"), "outcome": lead.get("outcome"),
                            "actions": rec.get("actions") or []}},
    }
    try:
        r = requests.post(f"{s.site_url}/api/voice/call-ended", json=body, timeout=15,
                          headers={"Authorization": f"Bearer {s.site_secret}"})
        return {"status": r.status_code} if r.status_code < 300 else {"status": r.status_code, "error": r.text[:200]}
    except requests.RequestException as e:
        return {"error": f"{type(e).__name__}: {e}"}


def _session_for(ctx: Ctx, transport, channel: str, meta: dict):
    async def on_finish(result: dict) -> None:
        ctx.spawn(finalize_call(ctx, result))

    if ctx.settings.engine == "s2s":
        return S2SSession(settings=ctx.settings, transport=transport, business=ctx.business,
                          channel=channel, meta=meta, on_finish=on_finish)
    return VoiceSession(settings=ctx.settings, providers=ctx.providers, transport=transport,
                        business=ctx.business, channel=channel, meta=meta, on_finish=on_finish,
                        actions=ActionRunner(ctx.business.get("actions"), notifier=ctx.notifier,
                                             company=ctx.business.get("company", "")))


async def make_session(ctx: Ctx, transport, channel: str, meta: dict):
    """Per-call session. In tenant mode the dialled number decides business, keys and actions.
    Returns None when the platform says this number may not be served."""
    if ctx.tenancy and ctx.tenancy.enabled:
        try:
            tenant = await ctx.tenancy.resolve(meta.get("to") or "")
        except RuntimeError as e:
            log.error("refusing call, tenant lookup failed: %s", e)
            return None
        if tenant is None:
            return None
        call_ctx = dc_replace(ctx, settings=tenant.settings, providers=tenant.providers,
                              notifier=Notifier(tenant.settings), business=tenant.business)
        log.info("call %s served as tenant %s", meta.get("call_id"), tenant.id)
        return _session_for(call_ctx, transport, channel, {**meta, "tenant_id": tenant.id})
    return _session_for(ctx, transport, channel, meta)


async def turn_away(ctx: Ctx, transport, text: str) -> None:
    """Polite refusal for a number that is not set up. Speaks with platform TTS, never tenant data."""
    session = VoiceSession(settings=ctx.settings, providers=ctx.providers, transport=transport,
                           business={"company": "", "agent_name": "", "greeting": text},
                           channel="phone", meta={})
    try:
        await session.start()
        if session._turn is not None:
            await asyncio.gather(session._turn, return_exceptions=True)
    except Exception:  # noqa: BLE001
        pass
    finally:
        await session.close("no_tenant", hangup=True)


def _admin_ok(request: Request, ctx: Ctx) -> bool:
    supplied = request.headers.get("authorization", "").removeprefix("Bearer ").strip() or request.query_params.get("token", "")
    return bool(supplied) and hmac.compare_digest(supplied, ctx.settings.admin_token)


# ------------------------------------------------------------------- routes
def create_app(settings: Settings | None = None, providers: Providers | None = None) -> Starlette:
    s = settings or Settings.load()
    business = load_business(s.config_path)
    ctx = Ctx(settings=s, providers=providers or build_providers(s), store=Store(s.data_dir),
              notifier=Notifier(s), telnyx=TelnyxClient(s), twilio=TwilioClient(s), business=business,
              tenancy=TenantRegistry(s, s.tenancy_url, s.tenancy_secret) if s.tenancy_url else None)

    async def health(request: Request):
        return JSONResponse({
            "ok": True, "engine": s.engine, "mock": s.mock_mode, "company": business["company"],
            "public_url_set": bool(s.public_base_url), "multitenant": bool(s.tenancy_url),
            "telnyx_configured": bool(s.telnyx_api_key),
            "twilio_configured": s.twilio_configured,
            **s.summary(),
        })

    async def public_config(request: Request):
        return JSONResponse({"company": business["company"], "agent_name": business["agent_name"],
                             "greeting": business["greeting"]})

    async def telnyx_webhook(request: Request):
        body = await request.body()
        if s.telnyx_public_key and not verify_signature(
            s.telnyx_public_key, request.headers.get("telnyx-signature-ed25519", ""),
            request.headers.get("telnyx-timestamp", ""), body,
        ):
            return JSONResponse({"error": "invalid signature"}, status_code=401)
        try:
            data = json.loads(body)["data"]
        except (ValueError, KeyError, TypeError):
            return JSONResponse({"error": "bad payload"}, status_code=400)
        et, p = data.get("event_type"), data.get("payload") or {}
        cc = p.get("call_control_id")
        client = ctx.telnyx
        if ctx.tenancy and ctx.tenancy.enabled and et in ("call.initiated", "call.answered"):
            try:
                tenant = await ctx.tenancy.resolve(p.get("to") or "")
            except RuntimeError as e:
                log.error("telnyx call refused, tenant lookup failed: %s", e)
                return JSONResponse({"error": "tenant lookup failed"}, status_code=503)
            if tenant is None:
                log.warning("telnyx call to unknown number %s not answered", p.get("to"))
                return JSONResponse({"ok": True, "skipped": "unknown number"})
            if tenant.settings.telnyx_api_key:
                client = TelnyxClient(tenant.settings)  # BYO number: act with the workspace's own key
        if et == "call.initiated" and p.get("direction") == "incoming" and cc:
            log.info("incoming call %s -> %s", p.get("from"), p.get("to"))
            ctx.spawn_blocking(client.answer, cc)
        elif et == "call.answered" and cc and cc not in ctx.streaming_started:
            ctx.streaming_started.add(cc)
            ctx.spawn_blocking(client.streaming_start, cc)
        elif et == "call.hangup" and cc:
            ctx.streaming_started.discard(cc)
        return JSONResponse({"ok": True})

    async def telnyx_media(ws: WebSocket):
        if ws.query_params.get("token") != s.ws_secret:
            await ws.close(code=4401)
            return
        await ws.accept()
        session = None
        up = Up2()
        try:
            while True:
                ev = json.loads(await ws.receive_text())
                kind = ev.get("event")
                if kind == "start":
                    st = ev.get("start") or {}
                    enc = (st.get("media_format") or {}).get("encoding", "PCMU")
                    if enc != "PCMU":
                        log.warning("unexpected media encoding %s (expected PCMU)", enc)
                    meta = {"from": st.get("from"), "to": st.get("to"), "call_id": st.get("call_control_id")}
                    transport = TelnyxTransport(ws, ctx, st.get("call_control_id"))
                    session = await make_session(ctx, transport, "phone", meta)
                    if session is None:
                        await turn_away(ctx, transport, NO_TENANT_LINE)
                        break
                    await session.start()
                elif kind == "media" and session is not None:
                    m = ev.get("media") or {}
                    if m.get("track", "inbound") != "inbound":
                        continue
                    pcm16k = up.process(ulaw_decode(base64.b64decode(m["payload"])))
                    await session.feed_pcm16k(pcm16k.astype("<i2").tobytes())
                elif kind == "stop":
                    break
        except WebSocketDisconnect:
            pass
        except Exception:  # noqa: BLE001
            log.exception("telnyx media loop error")
        finally:
            if session is not None:
                await session.close("remote_hangup")

    async def twilio_voice(request: Request):
        """Twilio Voice webhook: verify the signature, then hand the call to our websocket."""
        form = await request.form()
        params = form_params(form)
        token = s.twilio_signing_token
        if ctx.tenancy and ctx.tenancy.enabled:
            try:
                tenant = await ctx.tenancy.resolve(params.get("To", ""))
            except RuntimeError as e:
                log.error("twilio call refused, tenant lookup failed: %s", e)
                tenant = None
            if tenant is None:
                return PlainTextResponse(twiml_hangup(NO_TENANT_LINE), media_type="application/xml")
            token = tenant.settings.twilio_signing_token
        # No token means we cannot verify, and the TwiML carries the media token: refuse rather than leak it.
        if not token:
            log.error("twilio webhook refused: no auth token configured for %s", params.get("To"))
            return PlainTextResponse("voice is not configured", status_code=403)
        if not verify_twilio(token, request.headers.get("x-twilio-signature", ""), s.twilio_voice_url, params):
            log.warning("twilio webhook signature rejected (url=%s)", s.twilio_voice_url)
            return PlainTextResponse("invalid signature", status_code=401)
        call_sid = params.get("CallSid", "")
        log.info("incoming twilio call %s -> %s (%s)", params.get("From"), params.get("To"), call_sid)
        return PlainTextResponse(
            twiml(s.twilio_media_ws_url, s.ws_secret, call_sid, params.get("From", ""), params.get("To", "")),
            media_type="application/xml",
        )

    async def twilio_media(ws: WebSocket):
        if ws.query_params.get("token") != s.ws_secret:
            await ws.close(code=4401)
            return
        await ws.accept()
        session = None
        up = Up2()
        stream_sid = None
        try:
            while True:
                ev = json.loads(await ws.receive_text())
                kind = ev.get("event")
                if kind == "start":
                    st = ev.get("start") or {}
                    if (st.get("customParameters") or {}).get("token") not in (None, s.ws_secret):
                        await ws.close(code=4401)
                        return
                    stream_sid = st.get("streamSid")
                    call_sid = st.get("callSid")
                    custom = st.get("customParameters") or {}
                    meta = {"from": custom.get("from"), "to": custom.get("to"), "call_id": call_sid}
                    transport = TwilioTransport(ws, ctx, stream_sid, call_sid)
                    session = await make_session(ctx, transport, "phone", meta)
                    if session is None:
                        await turn_away(ctx, transport, NO_TENANT_LINE)
                        break
                    await session.start()
                elif kind == "media" and session is not None:
                    m = ev.get("media") or {}
                    if m.get("track", "inbound") != "inbound":
                        continue
                    pcm16k = up.process(ulaw_decode(base64.b64decode(m["payload"])))
                    await session.feed_pcm16k(pcm16k.astype("<i2").tobytes())
                elif kind == "stop":
                    break
        except WebSocketDisconnect:
            pass
        except Exception:  # noqa: BLE001
            log.exception("twilio media loop error")
        finally:
            if session is not None:
                await session.close("remote_hangup")

    async def web_ws(ws: WebSocket):
        origin = ws.headers.get("origin", "")
        if s.allowed_origins != ["*"] and origin and origin not in s.allowed_origins:
            await ws.close(code=4403)
            return
        await ws.accept()
        muted = ws.query_params.get("voice") == "0"
        transport = WebTransport(ws, muted=muted)
        meta = {"from": ws.query_params.get("page") or origin or "website", "to": "web"}
        session = _session_for(ctx, transport, "web", meta)  # website widget is platform-level for now
        await transport.send_event({"type": "ready", "audio": {"rate": transport.out_rate, "format": "pcm16"},
                                    "company": business["company"], "agent": business["agent_name"]})
        await session.start()
        try:
            while True:
                msg = await ws.receive()
                if msg["type"] == "websocket.disconnect":
                    break
                if msg.get("bytes"):
                    await session.feed_pcm16k(msg["bytes"])
                elif msg.get("text"):
                    try:
                        j = json.loads(msg["text"])
                    except ValueError:
                        continue
                    if j.get("type") == "text":
                        await session.user_text(str(j.get("text", ""))[:1000])
                    elif j.get("type") == "end":
                        break
        except WebSocketDisconnect:
            pass
        finally:
            await session.close("web_closed")

    async def lead_form(request: Request):
        ip = request.client.host if request.client else "?"
        hits = ctx.form_hits[ip]
        now = time.time()
        while hits and now - hits[0] > 3600:
            hits.popleft()
        if len(hits) >= 10:
            return JSONResponse({"error": "rate limited"}, status_code=429)
        try:
            body = await request.json()
        except ValueError:
            return JSONResponse({"error": "invalid json"}, status_code=400)
        if body.get("website"):  # honeypot
            return JSONResponse({"ok": True})
        email = (body.get("email") or "").strip().lower() or None
        if email and not EMAIL_RE.match(email):
            return JSONResponse({"error": "invalid email"}, status_code=400)
        if not email and not body.get("phone"):
            return JSONResponse({"error": "email or phone required"}, status_code=400)
        hits.append(now)
        lead = clean_lead({
            "name": str(body.get("name") or "")[:120] or None, "phone": str(body.get("phone") or "")[:40] or None,
            "email": email, "interest": str(body.get("interest") or "")[:200] or None,
            "outcome": "lead", "summary": str(body.get("message") or "Website form submission.")[:1000],
        }, None)
        rec = {"channel": "web_form", "caller": email or body.get("phone"), "callee": "web", "started": now,
               "ended": now, "duration": 0, "end_reason": "form", "transcript": [], "lead": lead,
               "summary": lead["summary"], "outcome": "lead", "company": business["company"]}
        rec["notify"] = await asyncio.to_thread(ctx.notifier.send, rec)
        rec["id"] = ctx.store.save(rec)
        return JSONResponse({"ok": True, "id": rec["id"]})

    async def calls(request: Request):
        if not _admin_ok(request, ctx):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        return JSONResponse({"calls": ctx.store.list(int(request.query_params.get("limit", 100)))})

    async def call_detail(request: Request):
        if not _admin_ok(request, ctx):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        rec = ctx.store.get(request.path_params["cid"])
        return JSONResponse(rec or {"error": "not found"}, status_code=200 if rec else 404)

    async def outbound(request: Request):
        if not _admin_ok(request, ctx):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        try:
            to = str((await request.json()).get("to", "")).strip()
        except ValueError:
            return JSONResponse({"error": "invalid json"}, status_code=400)
        if not E164.match(to):
            return JSONResponse({"error": "'to' must be E.164, e.g. +15551234567"}, status_code=400)
        if not (s.telnyx_api_key and s.telnyx_connection_id and s.public_base_url):
            return JSONResponse({"error": "set TELNYX_API_KEY, TELNYX_CONNECTION_ID and PUBLIC_BASE_URL first"}, status_code=400)
        try:
            res = await asyncio.to_thread(ctx.telnyx.dial, to, {"purpose": "outbound_sales"})
        except Exception as e:  # noqa: BLE001
            return JSONResponse({"error": str(e)}, status_code=502)
        return JSONResponse({"ok": True, "telnyx": res.get("data", {})})

    def static(name: str):
        async def handler(request: Request):
            f = WEB_DIR / name
            return FileResponse(f) if f.exists() else PlainTextResponse("not found", status_code=404)
        return handler

    routes = [
        Route("/", static("demo.html")),
        Route("/widget.js", static("widget.js")),
        Route("/admin", static("admin.html")),
        Route("/health", health),
        Route("/api/config", public_config),
        Route("/api/lead", lead_form, methods=["POST"]),
        Route("/api/calls", calls),
        Route("/api/calls/{cid}", call_detail),
        Route("/api/outbound", outbound, methods=["POST"]),
        Route("/telnyx/webhook", telnyx_webhook, methods=["POST"]),
        Route("/twilio/voice", twilio_voice, methods=["POST"]),
        WebSocketRoute("/telnyx/media", telnyx_media),
        WebSocketRoute("/twilio/media", twilio_media),
        WebSocketRoute("/web/ws", web_ws),
    ]
    middleware = [Middleware(CORSMiddleware, allow_origins=s.allowed_origins, allow_methods=["GET", "POST", "OPTIONS"],
                             allow_headers=["*"])]
    app = Starlette(routes=routes, middleware=middleware)
    app.state.ctx = ctx
    return app
