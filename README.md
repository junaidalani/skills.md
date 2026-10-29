# Agent Caller voice-agent platform

A Next.js App Router and PostgreSQL starter for an inbound AI receptionist platform. It includes a marketing site, public demo workspace, multi-tenant account/session foundations, agent settings, encrypted provider-key management, tenant-scoped calls and leads, Telnyx number search/order, Stripe Checkout and customer portal endpoints, a website widget key, and an audit trail.

## Run locally

1. Copy `.env.example` to `.env` and fill in the local `DATABASE_URL`, a unique `SESSION_SECRET`, and a separate `MASTER_ENCRYPTION_KEY`.
2. Install dependencies with `npm install`.
3. Apply the schema with `npx drizzle-kit push`.
4. Start Next.js with `npm run dev`.
5. Open `/` for the marketing site, `/dashboard` for the sample workspace, or `/signup` to create a private tenant.

The dashboard’s sample workspace is read-only and clearly marked. A real signup creates an owner account, 14-day trial tenant, membership, and starter agent.

### Demo login

A seeded account lets you check the authenticated dashboard immediately:

```
email:    demo@agent-caller.com
password: agent-caller-demo
```

Re-run `node scripts/seed-demo.mjs` to reset the password and refresh the sample calls, transcripts, and leads. The login form at `/login` posts to `/api/auth/login`, sets the signed session cookie, and opens `/dashboard` with that tenant’s real records.

### Homepage sections

1. Scroll-driven intro video (`public/media/voice-agent-intro.mp4`), with a reduced-motion player fallback.
2. Morphing industry gallery: the visible photo is a link to its industry guide (`/industries/[slug]`), with a visible “Explore …” affordance. Swiping changes slides without triggering navigation.
3. Trust strip, video ad, ROI calculator, services, animated pricing plans (monthly/annual toggle), and closing CTA.

## UI components

`src/components/ui` holds the shadcn-style primitives and visuals: `morph-gallery.tsx`, `animated-video-on-scroll.tsx`, `pricing.tsx`, `auth-ui.tsx`, `button.tsx`, `label.tsx`, `switch.tsx`, `input.tsx`, and `typewriter-text.tsx`. The Tailwind theme tokens in `globals.css` map shadcn names (`background`, `primary`, `muted-foreground`, `border`, `ring`) onto the Agent Caller palette, so copied components inherit the brand instead of default gray. `cn()` lives in `src/lib/utils.ts`; hooks are in `src/hooks`.

## Included platform flows

- **Accounts:** email/password signup and login, scrypt password hashes, signed httpOnly session cookies, and tenant membership checks.
- **Tenant data:** agent, phone number, call, transcript, lead, usage, provider credential, widget, subscription, integration, and audit tables are stored in Postgres via Drizzle.
- **Provider keys:** workspace owners can save, replace, test, switch, and remove provider keys. Keys are AES-256-GCM encrypted at rest; API responses return only a last-four mask. The UI never reads the stored value back.
- **Voice-provider tests:** basic credential tests are implemented for the configured provider types. Use provider test credentials first and review each provider’s rate limits and terms.
- **Numbers:** search US local Telnyx inventory, display vendor cost fields where present, and place a paid order only after an explicit confirmation. Purchases require a Telnyx key, `TELNYX_CONNECTION_ID`, an unexpired server-side search result, and remaining plan capacity. Telnyx handles any required regulatory review.
- **Billing:** Checkout, customer portal, signature-verified Stripe webhooks, and event idempotency are included. Configure Stripe test-mode prices and secrets before use.
- **Call data:** `/api/voice/call-ended` resolves an active dialed number to its tenant and stores the call, transcript turns, extracted lead, and usage. The endpoint is authenticated with a server-only bearer secret.
- **Widget:** the settings page creates an origin-allowlisted public widget key and copyable script snippet. The widget is a click-to-call button when an active number is assigned.

## Environment variables

See `.env.example`. In production, always generate unique secrets and set them through a secrets manager. `MASTER_ENCRYPTION_KEY` should be independent of the database URL and session secret. Rotate it only with a planned data-key rotation procedure.

Stripe Checkout uses `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, and `STRIPE_PRICE_PRO`. Configure the webhook URL as `/api/billing/webhook` and use Stripe test mode before live billing.

Telnyx number ordering attaches a number to `TELNYX_CONNECTION_ID`. Configure that connection in the Telnyx portal for the voice application and webhook/media-stream destination before buying live inventory. Purchases are paid actions.

## Live voice wiring

- `/api/voice/session-config?to=+1555…` (Bearer `VOICE_WEBHOOK_SECRET`) is what the Python voice
  service calls when a call starts. It returns that tenant's business text, action list, decrypted
  provider keys/models, email settings, and Twilio credentials, so a call is answered with the
  customer's own stack. Unknown/inactive numbers and suspended workspaces are refused there.
- `/api/integrations` stores the calendar / sheet / webhook endpoints the agent may act on (https
  only, encrypted). Each endpoint receives `{action,type,company,call_id,caller,secret,data}` and
  answers `{ok, message}`; the message is spoken to the caller.
- **Bring your own Twilio number:** on Phone numbers, a customer pastes the number, Account SID, and
  Auth Token. The route verifies the number exists on that Twilio account, saves the credentials
  encrypted, and marks the line active. They then set the number's Twilio voice webhook to
  `<VOICE_PUBLIC_URL>/twilio/voice`.
- Telnyx numbers stay platform-owned (purchased through the dashboard) because a Telnyx webhook is
  signed with the platform account's key.

## Bring in the existing voice agent

The original Python/WebSocket voice agent was not present in the starter repository. Place its source in `voice/` without moving the Next app or putting a long-lived media WebSocket into a serverless route. Read [`voice/README.md`](voice/README.md) for the integration contract. Run the media process on an always-on VPS/container service; the marketing site and account dashboard can be hosted separately.

The Next.js application currently handles account, settings, provider, number, billing, and call-ended APIs. It does **not** contain or run the original live audio pipeline, browser WebRTC calls, production transfer/media-stream orchestration, email/SMS delivery, distributed concurrency counters, or metered overage invoicing. Do not advertise a live call number until the voice service and Telnyx connection are configured and tested end to end.

## Security and launch notes

- Use HTTPS, a managed PostgreSQL service, encrypted backups, and a restore test.
- Set `SESSION_SECRET`, `MASTER_ENCRYPTION_KEY`, and `VOICE_WEBHOOK_SECRET` to separate high-entropy values.
- The in-memory login/test throttles are per-process safeguards, not a replacement for a distributed rate limiter at scale.
- Transcripts and phone numbers are sensitive. Define retention, deletion, export, access, and subprocessor policies for the actual deployment.
- Keep outbound calling disabled unless the person explicitly requested the callback and your consent process is reviewed.
- Do not collect payment-card numbers or protected health information. Recording consent, AI disclosure, SMS registration, and calling rules vary by location.
- Legal pages are starter text, not legal advice. Have qualified counsel review them before onboarding customers.
