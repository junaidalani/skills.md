# INTEGRATION PLAN: add the AI voice agent to the website

**Audience:** the AI coder working in the Next.js + PostgreSQL website repo.
**Goal:** customers log in, pick an AI model/voice/listening provider, add API keys (or use the platform's), attach a phone number from any carrier, and their agent answers real calls. Finished calls, transcripts and leads land in their dashboard.

Read sections 1-4 first. Sections 5-9 are the build spec. Section 12 is the acceptance checklist.

---

## 0. Honest status (read this, it prevents wasted work)

| Part | State |
|---|---|
| Single-tenant voice agent (phone + web widget, VAD, STT, LLM, TTS, barge-in, hang-up, lead extraction, email) | **Built and tested** against fake services (88 tests). Lives in `voice/`. |
| `agent.yaml` config format and provider presets (`app/config.py`) | **Built.** `Settings.from_raw(dict, env)` now exists so a config can come from a database instead of a file. |
| **Multi-tenant mode** (resolve tenant by dialed number, per-call keys, limits, call-ended webhook, per-call WS token, spool/retry, SSRF guard) | **Specified here, not yet built.** Build it in `voice/app/tenancy.py` per section 6. |
| Twilio carrier adapter | **Specified here, not yet built** (section 7). Signature algorithm was verified against Twilio's documented test vector. |
| Website pages, tables, APIs | **Specified here.** You build these. |
| Anything against live OpenRouter / Fish / Telnyx / Twilio / Hugging Face / Gmail | **Never run.** The build sandbox could not reach them. First task after deploy: `voice/scripts/live_check.py`, then one real call. |

Pricing and competitor numbers quoted from other sessions are third-party roundups (Sept-Oct 2026). **Verify before putting them on a pricing page.**

---

## 1. Decision: who hosts the keys, models and numbers?

**Recommendation: hybrid. Hosted by default, bring-your-own-key (BYOK) per provider, self-host export later.**

| | You host everything | Customer self-hosts | **Hybrid (recommended)** |
|---|---|---|---|
| Setup for customer | Sign up, pick plan, done | Install Python, tunnel, keys, webhooks | Sign up; optionally paste own keys |
| Your revenue | Recurring, plus margin on minutes | One-off licence | Recurring; BYOK customers pay a lower platform fee |
| Your cost/risk | You carry AI + carrier cost and fraud/abuse risk | Almost none | Risk only on platform-managed minutes; caps contain it |
| Support burden | Low per customer | **High** (every setup differs) | Low |
| Compliance | You are the operator (recording, AI disclosure, TCPA) | Customer's problem | You are the operator; BYOK moves cost, not liability |
| Lock-in | High (good for you) | None | Medium |

Rules that follow from this:
1. **Per provider slot, per tenant**: `llm`, `voice`, `listening` each use either `platform` keys (you bill minutes) or `own` keys (customer pays the provider directly).
2. **Numbers:** buy through the platform (Telnyx), or attach one the customer already owns (section 7). Any other carrier works via call forwarding to a platform number.
3. **Self-host kit** (`agent.yaml` export + `voice/` zip) is a secondary product for people who refuse hosting. Do not build it first.
4. **Free tiers cannot serve paying customers** (OpenRouter `:free` is about 50 requests/day; Fish free voice is for testing only; HF free has no credits). Platform-managed slots must use paid keys. Get Fish commercial resale terms in writing (business@fish.audio) before reselling Fish voice.
5. Plan on about **$0.05 per minute** all-in cost (estimate was $0.02-0.04). Price above that and cap minutes per plan.

---

## 2. Architecture

```
Caller ── carrier (Telnyx / Twilio / forwarded) ──► voice service (always-on VPS, Python)
                                                       │ 1. resolve dialed number ──► website  GET /api/internal/voice/resolve
                                                       │ 2. run call with that tenant's keys, in memory only
                                                       │ 3. call ends ──► website  POST /api/voice/call-ended
Browser ── Next.js dashboard ── Postgres (tenants, agents, encrypted keys, numbers, calls, leads, usage)
```

Hard rules:
- The voice service is a **long-lived WebSocket process**. Never a Next.js serverless function.
- **Postgres is owned by the website.** The voice service never connects to Postgres. It asks the website over HTTPS (this replaces the earlier idea of giving the voice service DB access: one place decrypts secrets, one place enforces tenancy).
- Secrets are decrypted **only** inside `/api/internal/voice/resolve`, returned over TLS to the voice service, held in memory for the call, never logged, never cached to disk.
- Browser routes never return a key after it is saved (show last 4 characters only).

---

## 3. Where to put things in the repo

```
voice/                  # Python service (this drop-in). Own Dockerfile. Deployed separately.
  app/ scripts/ tests/ agent.yaml catalog/providers.json INTEGRATION_PLAN.md graphify-out/
app/api/voice/call-ended/route.ts            # public-to-voice-service, Bearer VOICE_WEBHOOK_SECRET
app/api/internal/voice/resolve/route.ts      # Bearer VOICE_INTERNAL_SECRET
app/api/internal/voice/test-provider/route.ts
app/api/internal/voice/connect-number/route.ts   (or call the voice service's, see 7.3)
app/api/agents/[id]/...                      # dashboard CRUD
```

Do not overwrite the existing `voice/` agent files with website code (the existing `voice/README.md` says the same).

---

## 4. Environment variables

Website (Next.js server only):
| Var | Purpose |
|---|---|
| `VOICE_WEBHOOK_SECRET` | Bearer the voice service sends to `/api/voice/call-ended` |
| `VOICE_INTERNAL_SECRET` | Bearer the voice service sends to `/api/internal/voice/*` |
| `VOICE_SERVICE_URL` | e.g. `https://voice.example.com` (for test-provider / connect-number calls) |
| `SECRETS_ENCRYPTION_KEY` | 32-byte key (base64) for AES-256-GCM of tenant keys. Support rotation via a `key_version` column. |
| `TELNYX_CONNECTION_ID` | Call Control application id (must be set before buying numbers) |
| `PLATFORM_*_API_KEY` | Platform-managed keys (`OPENROUTER`, `FISH`, `GROQ`, `OPENAI`, `HF`, `ELEVENLABS`, `TELNYX`) |

Voice service:
| Var | Purpose |
|---|---|
| `TENANCY_URL` | Website base URL. **If unset the service runs single-tenant exactly as today.** |
| `VOICE_INTERNAL_SECRET`, `VOICE_WEBHOOK_SECRET` | same values as the website |
| `PUBLIC_BASE_URL` | Public https URL of the voice service |
| `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY` | Platform Telnyx account (webhook signature check) |
| `MAX_GLOBAL_CALLS` | Safety valve on one box (default 50) |
| `REDIS_URL` | Only if you run more than one voice instance (shared concurrency counters) |

Generate every secret with `openssl rand -hex 32`. Never commit them.

---

## 5. Database (suggested; adapt names to what exists)

Reuse the existing `phone_numbers` table (`e164` already exists). Add what is missing.

```sql
agents(id, tenant_id, name, status,                -- 'active' | 'paused'
       business jsonb,                             -- company, agent_name, greeting, products, faq, policies, collect[], goal
       llm_provider, llm_model, llm_fallbacks text[],
       voice_provider, voice_model, voice_id, voice_format,
       stt_provider, stt_model,
       llm_key_source, voice_key_source, stt_key_source,   -- 'platform' | 'own'
       lead_email_to, created_at, updated_at)

provider_keys(id, tenant_id, provider, label,
              ciphertext bytea, nonce bytea, key_version int, last4 text,
              status,                              -- 'unverified' | 'ok' | 'failed'
              last_checked_at, created_at, revoked_at)
-- UNIQUE(tenant_id, provider, label)

phone_numbers(id, tenant_id, agent_id, e164 UNIQUE, carrier,   -- 'telnyx'|'twilio'|'forward'
              carrier_ref, status, connection_state, created_at)
-- carrier_credentials: reuse provider_keys with provider 'twilio' (store {accountSid, authToken} as one encrypted JSON)

calls(id, tenant_id, agent_id, phone_number_id, call_id, from_e164, to_e164,
      started_at, ended_at, duration_seconds, outcome, summary, turns jsonb, created_at)
-- UNIQUE(tenant_id, call_id)   <- dedupe contract
leads(id, tenant_id, call_id, name, phone, email, reason, fields jsonb, created_at)
usage_events(id, tenant_id, call_id, minutes numeric, platform_cost_cents int, created_at)
audit_log(id, tenant_id, actor_user_id, action, target, created_at)  -- key added/rotated/revoked, number connected
```

Every query is scoped by `tenant_id` taken from the session (dashboard) or from the number (voice).

---

## 6. Voice service contract (the website implements the server side)

### 6.1 `GET /api/internal/voice/resolve?to=<E.164>`
Headers: `Authorization: Bearer <VOICE_INTERNAL_SECRET>`.

Behaviour: look up `phone_numbers.e164 = to AND status='active'`; join agent and tenant. Decrypt keys. For each slot (`llm`, `voice`, `listening`): `own` -> the tenant's decrypted key; `platform` -> the matching `PLATFORM_*` key. Check plan limits.

`200` response (agent.yaml-shaped, so `Settings.from_raw` consumes it unchanged):
```json
{
  "tenantId": "t_123", "agentId": "a_456", "callAllowed": true, "denyReason": null,
  "carrier": "telnyx",
  "carrierCredentials": null,
  "limits": { "maxConcurrent": 3, "maxCallSeconds": 600, "minutesRemaining": 412 },
  "config": {
    "keys":      { "openrouter": "sk-...", "fish": "...", "huggingface": "hf_..." },
    "llm":       { "provider": "openrouter", "model": "meta-llama/llama-3.3-70b-instruct", "fallback_models": [] },
    "voice":     { "provider": "fish", "model": "fish-audio/s2.1-pro", "voice": "", "format": "mp3" },
    "listening": { "provider": "hf", "model": "openai/whisper-large-v3-turbo" },
    "business":  { "company": "...", "agent_name": "...", "greeting": "...", "products": [], "faq": [], "collect": [] },
    "advanced":  { "max_call_s": 600 }
  }
}
```
- Unknown or inactive number: `404`. Over minutes/plan: `200` with `callAllowed:false` and `denyReason` (voice service plays a short "unavailable" message and hangs up).
- `Cache-Control: no-store`. Never log the response body.
- Twilio-carrier tenants: `carrierCredentials: { "accountSid": "AC...", "authToken": "..." }` (voice service needs it to verify signatures and hang up).

### 6.2 `POST /api/voice/call-ended`
Exactly the contract already in `voice/README.md` (Bearer `VOICE_WEBHOOK_SECRET`; body `callId,to,from,startedAt,endedAt,durationSeconds,outcome,summary,turns[],lead{name,phone,reason,fields}`).
Required behaviour: tenant from `to`; dedupe on `(tenant_id, callId)` and return `200` for a repeat; insert call + lead + usage; return `2xx` quickly. The voice service retries `5xx`/timeouts with backoff and spools failed payloads to disk, so **this endpoint must be idempotent**. Map the voice service's `role: user` to `caller`.

### 6.3 `POST /api/internal/voice/test-provider`
Body `{ kind: "llm"|"voice"|"listening", provider, model, apiKey?, baseUrl? }`. The dashboard's "Test connection" button calls the website route, which forwards to the voice service (`POST {VOICE_SERVICE_URL}/internal/test-provider`) so provider code lives in one place. Result `{ ok, latencyMs, message }` where `message` is plain English. Save `status='ok'|'failed'` on the key row. Never echo the key.

### 6.4 `GET catalog/providers.json`
Generated by `voice/scripts/export_catalog.py` from the presets in `app/config.py`. The dashboard dropdowns read this file, so a provider added in Python appears in the UI with no website change. Shape: `{ llm:[{id,label,needsKey,keyName,defaultModel,models:[...],baseUrlEditable}], voice:[...], listening:[...] }`.

### 6.5 Voice service internals (build in `voice/app/tenancy.py`)
1. **Telnyx webhook** `POST /telnyx/webhook`: on `call.initiated` (incoming), `resolve(to)`; if not allowed, `reject`/hang up; else answer. Store a `PendingCall` keyed by `call_control_id`. On `call.answered`, `streaming_start` with `stream_url = wss://.../telnyx/media?cc=<cc>&token=HMAC_SHA256(secret, cc)`. Verify the ed25519 signature with the platform key, or the tenant's own Telnyx public key if the tenant uses their own account.
2. **Media WebSocket**: verify the per-call token, fetch the `PendingCall`, build `Settings.from_raw(config, env={})` with the tenant config (never the server's own env), build providers, run the session. Clean up in `finally`.
3. **Limits:** per-tenant concurrency gate (in memory; Redis if multi-instance), global `MAX_GLOBAL_CALLS`, hard `max_call_s` from `limits`.
4. **Tenant mode does not email or store transcripts locally.** The website owns leads and notifications. Only the retry spool holds a payload, deleted after a `2xx`.
5. **SSRF guard:** tenant-supplied `base_url` (the `custom` provider) must be `https`, resolve to public IPs only (block loopback, link-local, RFC1918, metadata `169.254.169.254`), and no redirects to private hosts.
6. **Logging:** log tenant id, call id, durations, provider names. Never keys, never transcripts.
7. **Single-tenant mode stays working** when `TENANCY_URL` is unset (all current tests must keep passing).

---

## 7. Phone numbers from any provider

| Customer has | How | Dashboard flow |
|---|---|---|
| Nothing | Platform buys a Telnyx number ($1/mo + about $0.0035/min streaming, about $0.0052/min inbound; verify) | "Buy number": search by area code, buy, attach to the Call Control app (`TELNYX_CONNECTION_ID`), insert `phone_numbers` |
| A Telnyx account | BYO key + number | Paste API key; voice service lists numbers; pick one; service runs `scripts/setup_telnyx.py` logic (create/patch app, attach number) |
| A Twilio account | Twilio adapter | Paste Account SID + Auth Token; pick number; service sets the number's Voice webhook to `{PUBLIC_BASE_URL}/twilio/voice` |
| Any other carrier / existing business line | **Call forwarding** to a platform number | Show "Forward calls to +1...". No carrier integration needed |

### 7.1 Twilio adapter (to build in `voice/app/carriers.py`)
- `POST /twilio/voice`: verify `X-Twilio-Signature` = base64 HMAC-SHA1 of `full_url + concatenation of (key + value) for POST params sorted by key`, keyed by the tenant's auth token (algorithm verified against Twilio's documented vector; use constant-time compare). Resolve tenant by `To`. Return TwiML:
  ```xml
  <Response><Connect><Stream url="wss://.../twilio/media"><Parameter name="token" value="..."/><Parameter name="callSid" value="..."/></Stream></Connect></Response>
  ```
- `WS /twilio/media`: JSON events `connected`, `start` (has `streamSid`, `callSid`, `customParameters`), `media` (base64 μ-law 8 kHz, no header), `stop`. Send `{"event":"media","streamSid":..,"media":{"payload":..}}` and `{"event":"clear","streamSid":..}`. Reuses the same audio path as Telnyx (it is also μ-law 8 kHz).
- Hang up via Twilio REST `POST /2010-04-01/Accounts/{sid}/Calls/{callSid}.json` with `Status=completed`.

### 7.2 Compliance gates (do not skip)
- **Inbound first.** Outbound AI sales calls fall under the US TCPA: FCC (2024) treats AI voices as "artificial"; prior written consent is required; penalties start at $500 per call. Ship outbound only as **opt-in callbacks** (customer submits their number on a form with consent text), later.
- Greeting must say it is an AI, and mention recording if recording is on (default off).
- Register US 10DLC early if you add SMS.
- Have a lawyer review terms, privacy policy and AI-disclosure wording before taking payment.

### 7.3 Connect-number endpoint (voice service)
`POST /internal/connect-number` (Bearer `VOICE_INTERNAL_SECRET`) `{carrier, e164, credentials}` performs the carrier-side wiring and returns `{ok, message}`. The website stores the result and shows plain-English status.

---

## 8. Dashboard pages to build (map to what already exists)

Reuse the existing model/key/number pickers. Wire them like this:

1. **Agent builder** (`/dashboard/agents/[id]`): business fields (company, greeting, products, FAQ, what to collect), then three provider cards (Brain, Voice, Listening). Each card: provider dropdown (from the catalog), model dropdown (catalog models + free-text), key source toggle **Platform / My own key**, key field (write-only), **Test connection** button.
2. **Keys** (`/dashboard/keys`): list showing provider, label, last 4, status, last checked; add / rotate / revoke; every change writes `audit_log`.
3. **Numbers** (`/dashboard/numbers`): buy / connect Telnyx / connect Twilio / forwarding instructions; assign to an agent; status badge.
4. **Calls** (`/dashboard/calls`): list, transcript, summary, lead; filter by agent and date.
5. **Usage & billing:** minutes used vs plan, platform cost, per-call table.
6. **Test call:** a "Talk to your agent" button using the voice service's web widget endpoint (`/web/ws`) so customers test before attaching a number.

Plans (suggestion, tune after real cost data): Starter / Pro / Agency, each with minutes included, concurrent-call limit, agents, and "own keys allowed" toggle. Overage per minute above cost.

---

## 9. Security checklist

- AES-256-GCM per key, random nonce, `key_version` for rotation; encryption key only in server env.
- Keys decrypted only in `/api/internal/voice/resolve`; response `no-store`; never in logs, error messages, analytics.
- Internal routes accept only the Bearer secret, compared in constant time; IP-allowlist the voice host if you can.
- Per-call media WebSocket token (HMAC of call id); reject mismatches.
- Webhook signatures verified (Telnyx ed25519 over `timestamp|body`, 5 min tolerance; Twilio HMAC-SHA1).
- Rate-limit signup, key-test, number-purchase, and `resolve`. Cap spend per tenant per day on platform keys.
- SSRF guard on any tenant `base_url`.
- Tenancy test: tenant A can never read tenant B's agents, keys, numbers, calls.
- Retention: transcripts configurable (default 30-90 days); deletion on request; recordings off by default.
- Rotate the keys that were pasted into chat during development (OpenRouter, Telnyx, Hugging Face, Gmail app password).

---

## 10. Build order (about 12 working days, one coder)

1. **D1-2:** tables, encryption helper, `provider_keys` CRUD, catalog export, dashboard Keys page.
2. **D3-4:** Agent builder page, resolve endpoint, call-ended endpoint (idempotent) with tests.
3. **D5-7:** voice `tenancy.py` (resolver client, PendingCall, per-call token, limits, spool/retry, SSRF guard), tests against a fake website.
4. **D8:** deploy voice service on a VPS behind HTTPS; run `live_check.py`; **one real call on one platform number**.
5. **D9:** Numbers page: buy Telnyx number, assign, forwarding instructions.
6. **D10:** Twilio adapter + connect flow.
7. **D11:** Calls/usage pages, plan limits, billing hooks.
8. **D12:** two-tenant simultaneous-call test, abuse caps, legal pages, launch checklist.

---

## 11. Local development and testing

```bash
cd voice
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
python scripts/simulate_call.py                       # fake call, no accounts
python -m unittest discover -s tests -t .             # must stay green (88 tests today)
python scripts/live_check.py                          # needs real keys + network
python scripts/export_catalog.py > catalog/providers.json   # once built
```
For website-side tests, stub the voice service with a fixture that POSTs your call-ended example.

---

## 12. Acceptance checklist (the work is done only when all are true)

- [ ] Two tenants with different numbers, agents and keys take **simultaneous** calls; each hears their own greeting and uses their own keys.
- [ ] Tenant A's call never appears for tenant B (calls, leads, usage, keys, numbers).
- [ ] The same `callId` posted twice creates one row.
- [ ] Wrong Bearer on `resolve` / `call-ended` returns 401; a bad media token closes the socket.
- [ ] No key appears in any log, API response after save, or error message.
- [ ] "Test connection" gives a plain-English pass/fail for each provider type.
- [ ] Platform-managed minutes reduce `minutesRemaining`; at zero the caller gets a polite message and the call ends.
- [ ] A Twilio number and a Telnyx number both work; a forwarded number works.
- [ ] Voice service restarted mid-spool: pending call-ended payloads are delivered afterwards.
- [ ] `TENANCY_URL` unset: existing single-tenant tests still pass.
- [ ] One real phone call completed end to end on production, recorded in the runbook.

---

## 13. Open questions the owner must answer (with defaults)

1. Fish Audio commercial resale terms: default to OpenAI/ElevenLabs voices on platform slots until confirmed in writing.
2. Which plans and prices: default Starter/Pro/Agency with minute caps; confirm after measuring real cost per minute.
3. Recording: default off.
4. Outbound: default off (opt-in callbacks later).
