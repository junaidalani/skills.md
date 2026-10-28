# Voice Sales Agent

An AI agent that **answers your phone number, talks to callers voice-to-voice, sells, collects their details, and emails you the lead**. The same agent also runs on your **website** as a voice + chat widget.

```
Caller ── Telnyx number ──► /telnyx/media (websocket, mu-law 8 kHz)
Website ── widget.js ─────► /web/ws        (websocket, PCM16)
                                │
                  VAD ► listening (STT) ► brain (LLM) ► voice (TTS)      caller can interrupt anytime
                                │
              after the call: extract lead ► SQLite ► email (SMTP, Resend, or n8n; first that works)
```

## Everything is configured in ONE file: `agent.yaml`

Keys, which provider/model to use, the phone number, where leads go, and the business script all live in `agent.yaml`.
Secrets can alternatively come from environment variables or `.env` (those win over the file).

```yaml
keys:  {openrouter: "sk-or-...", huggingface: "hf_..."}
llm:   {provider: openrouter, model: meta-llama/llama-3.3-70b-instruct:free}
voice: {provider: openrouter, model: fish-audio/s2.1-pro-free}      # Fish Audio S2.1 Pro
listening: {provider: hf, model: openai/whisper-large-v3-turbo}
```

**Switching a provider = change the word after `provider:` and the `model:`.** The right base URL and key are picked automatically.

| Section | `provider:` choices |
|---|---|
| `llm` (brain) | `openrouter` `openai` `groq` `together` `mistral` `deepseek` `ollama` `custom` |
| `voice` | `openrouter` (Fish Audio S2.1 Pro) `fish` (Fish direct) `openai` `elevenlabs` `custom` |
| `listening` | `hf` (Whisper on Hugging Face) `openai` `groq` `fish` `custom` |

`custom` = any server that copies the OpenAI API: set `base_url:`. To add a brand-new provider type, see `app/providers.py` (each is a ~30 line class) and the presets table at the top of `app/config.py`.

Check any config in plain English: `python scripts/check_config.py` (it says things like *"provider 'groq' needs an API key. Put it under keys.groq"*).

## Quick start

Requires Python 3.11+ and `ffmpeg` (the Docker image has both).

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python scripts/check_config.py                     # is agent.yaml ready?
python scripts/simulate_call.py                    # full fake call, no accounts needed
python -m unittest discover -s tests -t .          # automated tests

python scripts/live_check.py                       # tests YOUR real keys: brain, voice, listening, phone. Saves out/tts_test.wav
python scripts/live_check.py --send-email          # also sends a test lead email

python -m app                                      # http://localhost:8000  (demo page + chat widget, /admin dashboard)
cloudflared tunnel --url http://localhost:8000     # public https URL (or ngrok http 8000)
python scripts/setup_telnyx.py --public-url https://YOUR-URL --write-env     # attaches your number
#   restart `python -m app`, then CALL your number
```

Docker: `docker compose up -d` (`--profile tunnel` adds a free public URL, `--profile n8n` adds n8n).

## Lead emails: three ways, with automatic fallback

`email.method: auto` tries whatever is configured, in this order, and **stops at the first that works** (no duplicate emails):

1. **SMTP / Gmail**: put a Gmail App Password in `email.smtp_password` (spaces are removed automatically). If `smtp_user` is empty the address in `send_leads_to` is used as the login.
2. **Resend** (HTTPS API, works where SMTP ports are blocked): `keys.resend`. Free sender `onboarding@resend.dev` can only email the Resend account owner; use your own verified domain in `email.from` for other recipients.
3. **n8n**: import `n8n/lead-to-email.json`, connect Gmail in n8n, activate it, paste its webhook URL into `email.n8n_webhook_url`.
4. If all fail, the lead is saved as `.eml` in `data/outbox/` (never lost).

About [maillab/cloud-mail](https://github.com/maillab/cloud-mail): I cloned and read it. It is a self-hosted mailbox platform for Cloudflare Workers (needs your own domain, D1 and R2) that sends through Resend. It is not an SMTP server this app can post to, so I did not bolt it on; the Resend method above is the same sending path it uses, without hosting a mail platform. Use it only if you want your own branded mailboxes.

## Add it to a website

```html
<script src="https://YOUR-SERVER/widget.js" data-title="Chat with us" data-color="#d97706" async></script>
```

Visitors type or press **Talk**. A contact form can POST JSON to `/api/lead`. Set `server.allowed_origins` to your site in production.

## Selling this to buyers

See `BUYER_GUIDE.md` (written for the buyer). To produce the sellable package:

```bash
python scripts/make_release.py      # dist/voice-sales-agent-product.zip  +  dist/agent.yaml
```

`dist/agent.yaml` is the **small file** a buyer fills in; the zip has no `.env`, no keys, no data. The test suite checks the release for leaked secrets.

## What was tested, and what was not

The build sandbox could not reach openrouter.ai, api.telnyx.com, huggingface.co or smtp.gmail.com, so **no live service was called** (a Gmail send attempt failed on DNS, saved to the outbox as designed). Everything else ran for real: 70+ automated tests, a real server process, and simulated phone calls through the genuine Telnyx media code.

Verified: the full call loop (greet, VAD, STT, streamed LLM, per-sentence TTS, mu-law audio, barge-in, hang-up); exact request shapes for every provider against local fake servers; provider switching from `agent.yaml`; SMTP delivery to a local mail server, Resend, n8n webhook (workflow JS run under Node), outbox fallback; Telnyx answer/stream/outbound/setup script; website chat, lead form, admin auth; the release zip contains no secrets.

**First things to check on your machine:** `live_check.py` (free OpenRouter models change; Fish voice; Whisper via Hugging Face; Telnyx lookup), then **one real phone call** while watching the server log, then Gmail delivery, then the widget in a real browser. ElevenLabs, OpenAI, Groq and Resend support follow their public API docs but were only tested against fakes. The `ENGINE=s2s` bridge (self-hosted [huggingface/speech-to-speech](vendor/speech-to-speech), needs a GPU) was tested only against a fake server.

## Security

- `.env` holds the keys you gave me and is git-ignored. They were pasted into chat, so **rotate them** (OpenRouter, Telnyx, Hugging Face, the Gmail App Password) when testing is done. `ADMIN_TOKEN` in your `.env` was replaced with a random value.
- Tell callers they are talking to an AI and that calls may be transcribed; follow local rules for outbound calling.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Call rings, nobody answers | Check `server.public_url`/tunnel, run `setup_telnyx.py`, Telnyx portal > Call Control app webhook |
| Answers but silent | `STT failed` / `TTS failed` in the log; run `live_check.py` |
| Agent cuts itself off | raise `advanced.vad_threshold` (default 400) |
| Slow replies | free models are slow; switch `llm.provider` to a paid one |
| Chipmunk audio with `voice.format: pcm` | set `voice.pcm_rate` to the value `live_check.py` prints (default `mp3` avoids this) |

## Layout

```
agent.yaml   <- the one file to edit          BUYER_GUIDE.md  <- hand this to buyers
app/         main.py session.py providers.py config.py leads.py telnyx.py audio.py s2s.py prompt.py
web/         widget.js demo.html admin.html          n8n/  lead-to-email.json
scripts/     check_config live_check simulate_call setup_telnyx make_release make_buyer_kit
tests/       fake services + tests                   vendor/  speech-to-speech (optional engine)
```
