# Your AI Voice Agent: setup guide

Your agent answers your phone number and your website, talks to customers, sells, collects their details and **emails you every lead**.

**You only ever edit one file: `agent.yaml`.** Save it, restart, done.

## 1. Get your keys (10 minutes)

You need one key per service. Paste each into the `keys:` section of `agent.yaml`.

| What it's for | Where to get it | `agent.yaml` line |
|---|---|---|
| The agent's brain | https://openrouter.ai/keys (has free models) | `keys.openrouter` |
| Understanding callers | https://huggingface.co/settings/tokens (a "read" token) | `keys.huggingface` |
| The phone number | https://portal.telnyx.com (buy a number, then API Keys) | `keys.telnyx` and `phone.number` |
| Email for leads | Gmail App Password: https://myaccount.google.com/apppasswords (needs 2-step verification on) | `email.smtp_password` |

The agent's voice (Fish Audio S2.1 Pro) is included through your OpenRouter key, so there is nothing extra to buy.

## 2. Fill in `agent.yaml`

1. `keys:` paste the keys from step 1.
2. `phone.number:` your phone number, like `"+15551234567"`.
3. `email.send_leads_to:` the address that should receive leads. For Gmail also paste the App Password into `email.smtp_password` (spaces are fine).
4. `server.admin_token:` make up a long password. It protects your dashboard.
5. `business:` describe your company, products, prices, FAQ and what to collect. **The agent only quotes what is written here.**

Then check it:

```
python scripts/check_config.py
```

It lists anything missing in plain English, for example `Put it under keys.groq in agent.yaml`. When it says **READY**, continue.

## 3. Start it

```
docker compose up -d          # or:  pip install -r requirements.txt && python -m app
```

Open `http://localhost:8000` for a demo page with the chat/voice button, and `/admin` for your call log and leads.

## 4. Connect the phone number

The phone company needs to reach your server over the internet.

1. Get a public address: `cloudflared tunnel --url http://localhost:8000` (free) or deploy to any server. Copy the `https://...` address.
2. Run: `python scripts/setup_telnyx.py --public-url https://YOUR-ADDRESS --write-env`
3. Restart, then call your number.

## 5. Put it on your website

Paste before `</body>` on any page:

```html
<script src="https://YOUR-ADDRESS/widget.js" data-title="Chat with us" async></script>
```

## Changing the AI later

Edit the word after `provider:` and the `model:`; your key is picked up automatically from `keys:`. Then restart.

| Section | provider options | Example models |
|---|---|---|
| `llm` (brain) | `openrouter`, `openai`, `groq`, `together`, `mistral`, `deepseek`, `ollama`, `custom` | `gpt-4o-mini`, `llama-3.3-70b-versatile`, `deepseek-chat` |
| `voice` (speaks) | `openrouter`, `fish`, `openai`, `elevenlabs`, `custom` | `fish-audio/s2.1-pro-free`, `gpt-4o-mini-tts`, `eleven_turbo_v2_5` |
| `listening` (hears) | `hf`, `openai`, `groq`, `fish`, `custom` | `openai/whisper-large-v3-turbo`, `whisper-1` |

Any other service that copies OpenAI's API works with `provider: custom` and a `base_url:`.
Example, using Groq for the brain and ElevenLabs for the voice:

```yaml
keys:  {groq: "gsk_...", elevenlabs: "..."}
llm:   {provider: groq}
voice: {provider: elevenlabs, voice: "your-voice-id"}
```

## If something is wrong

| Problem | Fix |
|---|---|
| `check_config.py` says NOT READY | Do what each line says |
| Phone rings but no answer | Tunnel/server not running, or step 4 not done |
| Agent silent | Run `python scripts/live_check.py`: it tests each service and says which key or model fails |
| Leads not arriving in Gmail | Check `email.smtp_password`; failed emails are saved in `data/outbox/` so nothing is lost. Alternative: `email.method: resend` with `keys.resend`, or n8n (`n8n/lead-to-email.json`) |
| Agent cuts itself off | Raise `advanced.vad_threshold` (e.g. 600) |
| Free models are slow or busy | Switch `llm.provider` to a paid one (openai, groq) |

## For the seller: hosting several buyers

Each buyer is one container with their own `agent.yaml`, their own phone number and their own public address:

```
docker build -t voice-agent .
docker run -d -p 8001:8000 --name acme \
  -v /srv/buyers/acme/agent.yaml:/srv/agent.yaml \
  -v /srv/buyers/acme/data:/srv/data voice-agent
```

Run `python scripts/setup_telnyx.py` (with that buyer's file as `AGENT_CONFIG=/srv/buyers/acme/agent.yaml`) to point their number at their container.
