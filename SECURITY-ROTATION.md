# Credentials to rotate

These secrets were pasted into chat or printed in tool output during setup. Rotate each at its provider, then update the value in `voice-sales-integration/voice-sales-agent-FULL-with-your-keys/voice-sales-agent/.env` and Vercel production env.

| Credential | Where to rotate | Used for |
|---|---|---|
| OpenRouter API key | openrouter.ai → Keys | LLM + TTS |
| Hugging Face token | huggingface.co → Settings → Access Tokens | Whisper STT |
| Twilio Auth Token | Twilio Console → Account → Auth Tokens | number + webhooks |
| Gmail app password (`SMTP_PASS`) | Google Account → Security → App passwords | welcome + reset emails |
| Neon `DATABASE_URL` | Neon Console → Roles → reset password | production DB |
| Agent Caller login password | `/dashboard` (or forgot-password flow) | website login |
| Telnyx API key (the latest pasted key and the one in the voice `.env`) | Telnyx Portal → API Keys | number search/purchase, call control |

After rotating: update `.env`, `npx vercel env rm NAME production`, `npx vercel env add NAME production`, redeploy, then re-test each provider in the dashboard.
