"""HTTP + websocket server (Starlette)."""
from __future__ import annotations

import asyncio
import base64
import hmac
import json
import logging
import re
import time
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

from .audio import Up2, pcm_array, ulaw_decode, ulaw_encode
from .config import ROOT, Settings
from .leads import EMAIL_RE, Notifier, Store, clean_lead, extract_lead
from .platform import TenantConfig, fetch_session_config, platform_ready, report_call_ended
from .prompt import load_business
from .providers import Providers, build_providers
from .s2s import S2SSession
from .session import VoiceSession
from .telnyx import TelnyxClient, verify_signature

log = logging.getLogger("app")
WEB_DIR = ROOT / "web"
E164 = re.compile(r"^\+[1-9]\d{7,14}$")


@dataclass
class Ctx:
    settings: Settings
    providers: Providers
    store: Store
    notifier: Notifier
    telnyx: TelnyxClient
    business: dict
    streaming_started: set = field(default_factory=set)
    pending: dict = field(default_factory=dict)  # call_control_id -> TenantConfig
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

    def __init__(self, ws: WebSocket, ctx: Ctx, call_control_id: str | None, client: TelnyxClient | None = None):
        self.ws, self.ctx, self.cc = ws, ctx, call_control_id
        self.client = client or ctx.telnyx

    async def send_audio(self, pcm16: bytes) -> None:
        payload = base64.b64encode(ulaw_encode(pcm_array(pcm16))).decode()
        await self._text(self.ws, {"event": "media", "media": {"payload": payload}})

    async def clear(self) -> None:
        await self._text(self.ws, {"event": "clear"})

    async def send_event(self, ev: dict) -> None:
        return None

    async def hangup(self) -> None:
        if self.cc:
            await asyncio.to_thread(self.client.hangup, self.cc)


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
async def finalize_call(ctx: Ctx, result: dict, tenant: TenantConfig | None = None) -> dict:
    """Extract lead data, store the call and email it. Runs after every call."""
    turns = result.get("transcript") or []
    llm = tenant.providers.llm if tenant and tenant.providers.llm else ctx.providers.llm
    lead = await extract_lead(llm, turns, result.get("caller"))
    company = (tenant.business.get("company") if tenant else None) or ctx.business.get("company")
    rec = {**result, "company": company, "lead": lead,
           "summary": lead["summary"], "outcome": lead["outcome"]}
    spoke = any(t["role"] == "user" for t in turns)
    if tenant is not None:  # the platform stores leads/calls per tenant; skip local SMTP
        rec["notify"] = {"skipped": "platform handles notifications"}
        rec["platform_tenant_id"] = tenant.tenant_id
    else:
        rec["notify"] = (
            await asyncio.to_thread(ctx.notifier.send, rec)
            if (spoke or ctx.settings.email_empty_calls) else {"skipped": "no caller speech"}
        )
    rec["id"] = ctx.store.save(rec)
    if tenant is not None:
        ctx.spawn_blocking(report_call_ended, ctx.settings, tenant, rec)
    log.info("call %s finalized: outcome=%s notify=%s", rec["id"], rec["outcome"], rec["notify"])
    return rec


def make_session(ctx: Ctx, transport, channel: str, meta: dict, tenant: TenantConfig | None = None):
    async def on_finish(result: dict) -> None:
        ctx.spawn(finalize_call(ctx, result, tenant))

    settings = tenant.settings if tenant else ctx.settings
    providers = ctx.providers if tenant is None else Providers(
        stt=tenant.providers.stt or ctx.providers.stt,
        llm=tenant.providers.llm or ctx.providers.llm,
        tts=tenant.providers.tts or ctx.providers.tts,
    )
    business = (tenant.business if tenant else ctx.business) or ctx.business
    if ctx.settings.engine == "s2s":
        return S2SSession(settings=settings, transport=transport, business=business,
                          channel=channel, meta=meta, on_finish=on_finish)
    return VoiceSession(settings=settings, providers=providers, transport=transport,
                        business=business, channel=channel, meta=meta, on_finish=on_finish)


def _admin_ok(request: Request, ctx: Ctx) -> bool:
    supplied = request.headers.get("authorization", "").removeprefix("Bearer ").strip() or request.query_params.get("token", "")
    return bool(supplied) and hmac.compare_digest(supplied, ctx.settings.admin_token)


# ------------------------------------------------------------------- routes
def create_app(settings: Settings | None = None, providers: Providers | None = None) -> Starlette:
    s = settings or Settings.load()
    business = load_business(s.business_config)
    ctx = Ctx(settings=s, providers=providers or build_providers(s), store=Store(s.data_dir),
              notifier=Notifier(s), telnyx=TelnyxClient(s), business=business)

    async def health(request: Request):
        return JSONResponse({
            "ok": True, "engine": s.engine, "mock": s.mock_mode, "company": business["company"],
            "public_url_set": bool(s.public_base_url), "telnyx_configured": bool(s.telnyx_api_key),
            "platform": platform_ready(s), "tts": s.tts_model, "stt": f"{s.stt_provider}:{s.stt_model}",
            "llm": s.llm_model,
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

        def handle_incoming() -> None:
            to = str(p.get("to") or "")
            tenant = fetch_session_config(s, to) if platform_ready(s) else None
            client = tenant.telnyx if (tenant is not None and tenant.telnyx is not None) else ctx.telnyx
            try:
                client.answer(cc)
            except Exception as e:  # noqa: BLE001
                if client is not ctx.telnyx and s.telnyx_api_key:
                    log.warning("tenant answer failed (%s); retrying with the platform key", e)
                    tenant.telnyx = None
                    ctx.telnyx.answer(cc)
                else:
                    raise
            if tenant is not None:
                ctx.pending[cc] = tenant

        if et == "call.initiated" and p.get("direction") == "incoming" and cc:
            log.info("incoming call %s -> %s", p.get("from"), p.get("to"))
            ctx.spawn_blocking(handle_incoming)
        elif et == "call.answered" and cc and cc not in ctx.streaming_started:
            ctx.streaming_started.add(cc)
            tenant = ctx.pending.get(cc)
            client = tenant.telnyx if (tenant and tenant.telnyx is not None) else ctx.telnyx
            ctx.spawn_blocking(client.streaming_start, cc)
        elif et == "call.hangup" and cc:
            ctx.streaming_started.discard(cc)
            ctx.pending.pop(cc, None)
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
                    cc = st.get("call_control_id")
                    meta = {"from": st.get("from"), "to": st.get("to"), "call_id": cc}
                    tenant = ctx.pending.pop(cc, None)
                    if tenant is None and platform_ready(s):
                        tenant = await asyncio.to_thread(fetch_session_config, s, st.get("to") or "")
                    session = make_session(ctx, TelnyxTransport(ws, ctx, cc, tenant.telnyx if tenant else None), "phone", meta, tenant)
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

    async def web_ws(ws: WebSocket):
        origin = ws.headers.get("origin", "")
        if s.allowed_origins != ["*"] and origin and origin not in s.allowed_origins:
            await ws.close(code=4403)
            return
        await ws.accept()
        muted = ws.query_params.get("voice") == "0"
        transport = WebTransport(ws, muted=muted)
        meta = {"from": ws.query_params.get("page") or origin or "website", "to": "web"}
        session = make_session(ctx, transport, "web", meta)
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
        WebSocketRoute("/telnyx/media", telnyx_media),
        WebSocketRoute("/web/ws", web_ws),
    ]
    middleware = [Middleware(CORSMiddleware, allow_origins=s.allowed_origins, allow_methods=["GET", "POST", "OPTIONS"],
                             allow_headers=["*"])]
    app = Starlette(routes=routes, middleware=middleware)
    app.state.ctx = ctx
    return app
