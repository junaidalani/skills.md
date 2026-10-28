# Voice Sales Agent

An AI agent that **answers your phone number, talks to callers voice-to-voice, sells, collects their details, and emails you the lead**. The same agent also runs on your **website** as a voice + chat widget.

```
Caller ── Telnyx +15519007793 ──► /telnyx/media (websocket, mu-law 8 kHz)
Website ── widget.js ──────────► /web/ws        (websocket, PCM16)
                                     │
                       VAD ► STT (Whisper on Hugging Face) ► LLM (OpenRouter) ► TTS (Fish Audio S2.1 Pro)
                                     │                         └─ barge-in: caller can interrupt anytime
                                     ▼
              after the call: extract lead (name/phone/email/interest) ► SQLite ► email to you
                                                                          (SMTP, or n8n -> Gmail)
```

## Quick start (about 10 minutes)

Requires Python 3.11+ and `ffmpeg` (Docker image has both).

```bash
cd voice-sales-agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 1. Try it with NO accounts, NO network (scripted fake AI): proves your install works
python scripts/simulate_call.py
python -m unittest discover -s tests -t .          # 55 tests

# 2. Check every real service with your keys (.env is pre-filled)
python scripts/live_check.py                       # LLM, TTS, STT, Telnyx. Saves out/tts_test.wav so you can listen
python scripts/live_check.py --send-email          # also sends a test lead email

# 3. Start the server and expose it publicly (Telnyx needs a public https URL)
python -m app                                      # http://localhost:8000
cloudflared tunnel --url http://localhost:8000     # or: ngrok http 8000  -> copy the https URL

# 4. Point your Telnyx number at it (creates the Call Control app, attaches +15519007793)
python scripts/setup_telnyx.py --public-url https://YOUR-TUNNEL-URL --write-env
#    restart `python -m app`, then CALL +1 551 900 7793

# Website demo + widget:  http://localhost:8000     Dashboard: http://localhost:8000/admin
```

Docker instead: `docker compose up -d` (add `--profile tunnel` for a free public URL, `--profile n8n` for n8n).

## Make it sell YOUR business

Edit **`config/business.yaml`** (company, greeting, products and prices, FAQ, policies, what details to collect, call goal). No code changes. The agent only quotes prices that are in that file.

## Get the lead emails into Gmail

Leads go to `LEAD_EMAIL_TO` (set to `junaidalani2001@gmail.com`). Pick one:

1. **SMTP (simplest):** create a Gmail *App Password* (https://myaccount.google.com/apppasswords, needs 2-step verification) and set `SMTP_USER=you@gmail.com`, `SMTP_PASS=<app password>` in `.env`.
2. **n8n:** import `n8n/lead-to-email.json`, connect your Gmail credential, activate it, paste the production webhook URL into `N8N_WEBHOOK_URL`.

Until one is configured, every lead is saved as a `.eml` file in `data/outbox/`, so nothing is lost.

## Add it to a website

```html
<script src="https://YOUR-SERVER/widget.js" data-title="Chat with Sam" data-color="#d97706" async></script>
```

Visitors can type or press **Talk** (microphone, with barge-in). A plain contact form can POST JSON to `/api/lead`. Set `ALLOWED_ORIGINS=https://yoursite.com` in production.

## Other things included

| Feature | How |
|---|---|
| **Outbound sales calls** | Dashboard form or `POST /api/outbound {"to":"+1..."}` with `Authorization: Bearer <ADMIN_TOKEN>` (needs `TELNYX_CONNECTION_ID`, an outbound voice profile on your Telnyx account, and consent from whoever you call) |
| **Call log + transcripts + leads** | `/admin` (enter `ADMIN_TOKEN`), or `GET /api/calls` |
| **True voice-to-voice engine (optional)** | `ENGINE=s2s` bridges calls to a self-hosted [huggingface/speech-to-speech](vendor/speech-to-speech) server (GPU) over the OpenAI Realtime protocol. Default engine is the cloud pipeline above |
| **Fish Audio MCP** | `.mcp.json` registers `https://api.fish.audio/mcp` for Claude Code (browse voices, test speech). It uses OAuth, so it is a developer tool, not part of the live call path |
| **Telnyx webhook signing** | Set `TELNYX_PUBLIC_KEY` (Telnyx portal > Keys) to reject forged webhooks |
| **Different voice** | Set `TTS_VOICE` to a Fish voice-library ID |

Settings reference: everything is in `.env.example`.

## What was tested, and what was not

I built this in a sandbox that **cannot reach openrouter.ai, api.telnyx.com or huggingface.co**, so the live services were never called. Everything else ran for real:

**Verified here (55 automated tests, plus real server + simulated call):**
- Full phone-call loop through the genuine Telnyx media-websocket code: greeting, VAD, STT, streamed LLM, sentence-by-sentence TTS, mu-law 8 kHz audio back, caller-interrupts-agent (`clear`), agent hang-up via `[[END_CALL]]`, idle/error handling
- The real STT/LLM/TTS client classes against local fake OpenRouter / Hugging Face / Fish / Telnyx servers: exact request shapes (model `fish-audio/s2.1-pro-free`, auth headers, WAV upload, SSE streaming, model fallback, error handling), MP3 decoded with real ffmpeg
- Real SMTP delivery of the lead email to `junaidalani2001@gmail.com` (to a local SMTP server), n8n webhook delivery, outbox fallback, the n8n workflow's JavaScript executed under Node
- Telnyx: answer then `streaming_start` sequence, webhook signature verification, outbound dial, `setup_telnyx.py` create/update/attach
- Website websocket chat, lead form (validation, honeypot, rate limit), admin auth, origin allowlist
- Widget JavaScript passes a syntax check

**NOT verified, so please test these first (`live_check.py` covers the first four):**
1. OpenRouter free models: availability changes. If `LLM_MODEL` fails, pick another `:free` model on openrouter.ai/models. Fallbacks are tried automatically.
2. Fish TTS output through OpenRouter, and voice quality.
3. Hugging Face Whisper endpoint (`router.huggingface.co/hf-inference`). If it is unavailable for your token, set `STT_PROVIDER=fish` (needs `FISH_API_KEY`).
4. Telnyx number lookup and attach.
5. **A real phone call.** The `answer` then `streaming_start` (PCMU, bidirectional RTP) flow follows Telnyx's documented API, but the first real call is the true test. Watch the server log while you call.
6. The widget in a real browser (microphone, playback), and the `ENGINE=s2s` bridge against a real Hugging Face server (only tested against a fake one).
7. Gmail sending needs your App Password (see above).

## Security notes

- `.env` contains the keys you gave me and is git-ignored. They were pasted in chat, so **rotate them** (OpenRouter, Telnyx, Hugging Face) once you are done testing, and set a strong `ADMIN_TOKEN`.
- Do not expose `/admin` without a strong token. Calls and transcripts are personal data: tell callers they are talking to an AI and that the call may be recorded or transcribed where the law requires it, and follow local rules for outbound calling (consent, do-not-call lists).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Call rings, nobody answers | Webhook not reaching you: check `PUBLIC_BASE_URL`, tunnel running, `setup_telnyx.py` ran, Telnyx portal > Call Control app > webhook URL |
| Answers but silent | Look for `STT failed` / `TTS failed` lines in the server log; run `live_check.py` |
| Agent cuts itself off | Echo on the line: raise `VAD_THRESHOLD` (default 400) |
| Agent waits too long after you speak | Lower `VAD_END_MS` (default 700) |
| Robotic delay | Free models are slower; use a paid LLM (`LLM_MODEL`) and Fish `s2.1-pro` (`TTS_PROVIDER=fish`) |
| Chipmunk/slow audio with `TTS_FORMAT=pcm` | Set `TTS_PCM_RATE` to the value `live_check.py` prints (default format `mp3` avoids this) |

## Layout

```
app/        server: main.py (routes) session.py (conversation engine) providers.py (LLM/TTS/STT)
            audio.py (mu-law, VAD) leads.py (storage+email) telnyx.py s2s.py prompt.py
config/     business.yaml   <- edit this
web/        widget.js  demo.html  admin.html
n8n/        lead-to-email.json
scripts/    setup_telnyx.py  live_check.py  simulate_call.py
tests/      55 tests + fake services
vendor/     speech-to-speech (huggingface, for ENGINE=s2s)
```
