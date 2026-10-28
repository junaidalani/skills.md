import { timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, integrations, phoneNumbers, providerCredentials, tenants, usageEvents } from "@/db/schema";
import { decryptProviderSecret } from "@/lib/provider-crypto";
import { planFor } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/voice/session-config?to=+1555...
 * The voice service calls this when a call starts, to learn who is being called and with which
 * providers, keys, business details and actions. Auth: Bearer VOICE_WEBHOOK_SECRET.
 */

type VoiceProvider = { provider: string; base_url: string; model: string; format?: string };

// Dashboard display names -> what the voice service actually speaks to.
// A provider missing here is not supported by the pipeline yet; the key is ignored and reported.
const MAP: Record<string, Record<string, VoiceProvider>> = {
  llm: {
    OpenAI: { provider: "openai", base_url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    Groq: { provider: "groq", base_url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
    OpenRouter: { provider: "openrouter", base_url: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
    DeepSeek: { provider: "deepseek", base_url: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    // Both expose an OpenAI-compatible /chat/completions endpoint, which is all the pipeline needs.
    Anthropic: { provider: "custom", base_url: "https://api.anthropic.com/v1", model: "claude-sonnet-5-5" },
    Google: { provider: "custom", base_url: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" },
  },
  stt: {
    OpenAI: { provider: "openai", base_url: "https://api.openai.com/v1", model: "whisper-1" },
    "Groq Whisper": { provider: "groq", base_url: "https://api.groq.com/openai/v1", model: "whisper-large-v3-turbo" },
    "Hugging Face": { provider: "hf", base_url: "https://router.huggingface.co/hf-inference/models", model: "openai/whisper-large-v3-turbo" },
  },
  tts: {
    ElevenLabs: { provider: "elevenlabs", base_url: "https://api.elevenlabs.io", model: "eleven_flash_v2_5" },
    OpenAI: { provider: "openai", base_url: "https://api.openai.com/v1", model: "gpt-4o-mini-tts", format: "mp3" },
    // OpenRouter's OpenAI-compatible /audio/speech route, with Fish Audio's free S2.1 Pro voice.
    OpenRouter: { provider: "openrouter", base_url: "https://openrouter.ai/api/v1", model: "fish-audio/s2.1-pro-free", format: "mp3" },
    "Fish Audio": { provider: "fish", base_url: "https://api.fish.audio/compat/api/v1", model: "fish-audio/s2.1-pro", format: "mp3" },
  },
};

const GOALS: Record<string, string> = {
  appointmentBooking: "Book the caller into a free appointment slot and confirm it back to them.",
  leadCapture: "Answer questions and capture the caller's details so the team can follow up.",
  voicemail: "Take a clear message (who it is for, what it is about, name and phone) when nobody is available.",
  transfer: "Help the caller and take a message if a transfer is not possible.",
};

function constantTimeMatch(a: string, b: string) {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}

function parseIntegration(configCiphertext: string | null): Record<string, unknown> {
  if (!configCiphertext) return {};
  try {
    return JSON.parse(decryptProviderSecret(configCiphertext)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function modelFor(kind: string, mapped: VoiceProvider, stored: string | null) {
  // The dashboard lets users type a label ("GPT-4o mini"); only trust API-looking slugs.
  return stored && /^[a-zA-Z0-9._:/-]+$/.test(stored) ? stored : mapped.model;
}

export async function GET(request: Request) {
  const secret = process.env.VOICE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Set VOICE_WEBHOOK_SECRET to let the voice service load tenants." }, { status: 503 });
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!constantTimeMatch(supplied, secret)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const raw = new URL(request.url).searchParams.get("to")?.trim() || "";
  const to = raw.replace(/[\s()-]/g, "");
  if (!/^\+?[0-9]{7,16}$/.test(to)) return NextResponse.json({ error: "A valid dialed number is required." }, { status: 400 });

  const [row] = await db
    .select({ number: phoneNumbers, tenant: tenants, agent: agents })
    .from(phoneNumbers)
    .innerJoin(tenants, eq(phoneNumbers.tenantId, tenants.id))
    .leftJoin(agents, eq(phoneNumbers.agentId, agents.id))
    .where(eq(phoneNumbers.e164, to))
    .limit(1);
  if (!row) return NextResponse.json({ error: "This number is not assigned to a tenant." }, { status: 404 });
  if (row.number.status !== "active") return NextResponse.json({ error: "This number is not active.", status: row.number.status }, { status: 409 });
  if (row.tenant.status === "suspended" || row.tenant.status === "cancelled") {
    return NextResponse.json({ error: "This account is not active." }, { status: 403 });
  }

  const agent = row.agent;
  const businessInfo = (agent?.businessInfo || {}) as Record<string, unknown>;
  const voiceSettings = (agent?.voiceSettings || {}) as Record<string, unknown>;
  const service = (agent?.serviceSettings || {}) as Record<string, boolean>;

  const creds = await db.select().from(providerCredentials).where(eq(providerCredentials.tenantId, row.tenant.id));
  const warnings: string[] = [];
  const providers: Record<string, VoiceProvider & { api_key: string }> = {};
  for (const cred of creds) {
    if (cred.kind === "telephony") continue; // platform-owned
    if (cred.kind === "email") continue; // read into `email.resend_api_key` below
    const mapped = MAP[cred.kind]?.[cred.provider];
    if (!mapped) {
      if (cred.keyCiphertext) warnings.push(`${cred.provider} is not supported for ${cred.kind} yet; the platform default is used.`);
      continue;
    }
    let apiKey = "";
    try {
      apiKey = cred.keyCiphertext ? decryptProviderSecret(cred.keyCiphertext) : "";
    } catch {
      warnings.push(`${cred.provider} key could not be decrypted; the platform default is used.`);
      continue;
    }
    if (!apiKey) continue;
    providers[cred.kind] = { ...mapped, model: modelFor(cred.kind, mapped, cred.model), api_key: apiKey };
  }
  const telCred = creds.find((c) => c.kind === "telephony" && c.keyCiphertext);
  let telephony: Record<string, string> | undefined;
  if (!row.number.telnyxNumberId && telCred?.keyCiphertext) {
    try {
      const raw = decryptProviderSecret(telCred.keyCiphertext);
      if (telCred.provider === "Twilio") {
        const parsed = JSON.parse(raw) as { account_sid?: string; auth_token?: string; phone_number?: string };
        if (parsed.account_sid && parsed.auth_token) telephony = { provider: "twilio", account_sid: parsed.account_sid, auth_token: parsed.auth_token, phone_number: parsed.phone_number || to };
      }
    } catch {
      warnings.push("Telephony credentials could not be decrypted; the platform carrier settings are used.");
    }
  }

  const emailCred = creds.find((c) => c.kind === "email" && c.provider === "Resend" && c.keyCiphertext);
  let resendKey = "";
  if (emailCred?.keyCiphertext) {
    try {
      resendKey = decryptProviderSecret(emailCred.keyCiphertext);
    } catch {
      warnings.push("Resend key could not be decrypted.");
    }
  }

  const conns = await db.select().from(integrations).where(eq(integrations.tenantId, row.tenant.id));
  const byKind = new Map(conns.map((c) => [c.kind, parseIntegration(c.configCiphertext)]));

  // A Telnyx number connected with the workspace's own key answers calls with that key.
  const telnyx = byKind.get("telnyx-credentials");
  if (row.number.telnyxNumberId && typeof telnyx?.api_key === "string" && telnyx.api_key) {
    telephony = { provider: "telnyx", api_key: telnyx.api_key, phone_number: to, connection_id: String(telnyx.connection_id || "") };
  }

  // Plan minutes for the current month, so the voice service can cap a call (and, later, refuse at zero).
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const [usage] = await db
    .select({ minutes: sql<number>`coalesce(sum(${usageEvents.minutes}), 0)` })
    .from(usageEvents)
    .where(and(eq(usageEvents.tenantId, row.tenant.id), eq(usageEvents.period, period)));
  const minutesRemaining = Math.max(0, planFor(row.tenant.planId) - Number(usage?.minutes || 0));

  const actions: Array<Record<string, unknown>> = [];
  const calendar = byKind.get("google_calendar") || byKind.get("calendar");
  if (calendar?.url) {
    actions.push({ type: "calendar", url: String(calendar.url), secret: String(calendar.secret || "") });
    actions.push({ type: "availability", url: String(calendar.url), secret: String(calendar.secret || "") });
  } else if (service.appointmentBooking) {
    warnings.push("Calendar booking is on but no calendar is connected.");
  }
  const emailTo = String(businessInfo.emailTo || process.env.VOICE_LEAD_EMAIL_TO || "");
  if (service.leadCapture !== false && emailTo) actions.push({ type: "email", to: emailTo });
  const sheets = byKind.get("google_sheets") || byKind.get("sheets");
  if (sheets?.url) actions.push({ type: "sheet", url: String(sheets.url), secret: String(sheets.secret || "") });
  const hook = byKind.get("webhook") || byKind.get("n8n");
  if (hook?.url) actions.push({ type: "webhook", url: String(hook.url), secret: String(hook.secret || "") });

  const workType = Object.keys(GOALS).find((key) => service[key]);
  const business = {
    company: String(businessInfo.businessName || row.tenant.name),
    agent_name: agent?.name || "Assistant",
    greeting: agent?.greeting || undefined,
    business_hours: businessInfo.businessHours ? String(businessInfo.businessHours) : undefined,
    personality: voiceSettings.tone ? String(voiceSettings.tone) : undefined,
    about: businessInfo.services ? String(businessInfo.services) : undefined,
    goal: workType ? GOALS[workType] : GOALS.leadCapture,
    collect: ["full name", "best phone number", "reason for calling"],
    actions,
  };

  return NextResponse.json({
    tenantId: row.tenant.id,
    agentId: agent?.id || null,
    planId: row.tenant.planId,
    limits: { maxCallSeconds: 900, minutesRemaining },
    business,
    actions,
    providers,
    telephony,
    email: { to: emailTo, resend_api_key: resendKey },
    warnings,
  });
}
