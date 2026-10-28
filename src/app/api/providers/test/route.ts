import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLog, providerCredentials } from "@/db/schema";
import { decryptProviderSecret } from "@/lib/provider-crypto";
import { isProviderKind } from "@/lib/provider-catalog";
import { allowRequest } from "@/lib/rate-limit";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant-context";

export const runtime = "nodejs";

function requestDetails(kind: string, provider: string, key: string): { url: string; headers: Record<string, string> } | null {
  const bearer = { Authorization: `Bearer ${key}` };
  switch (`${kind}:${provider}`) {
    case "llm:OpenAI": case "stt:OpenAI": case "tts:OpenAI": return { url: "https://api.openai.com/v1/models", headers: bearer };
    case "llm:Groq": case "stt:Groq Whisper": return { url: "https://api.groq.com/openai/v1/models", headers: bearer };
    case "llm:OpenRouter": case "tts:OpenRouter": return { url: "https://openrouter.ai/api/v1/models", headers: bearer };
    case "stt:Hugging Face": return { url: "https://huggingface.co/api/whoami-v2", headers: bearer };
    case "llm:DeepSeek": return { url: "https://api.deepseek.com/models", headers: bearer };
    case "llm:Anthropic": return { url: "https://api.anthropic.com/v1/models?limit=1", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } };
    case "llm:Google": return { url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, headers: {} };
    case "stt:Deepgram": case "tts:Deepgram Aura": return { url: "https://api.deepgram.com/v1/projects", headers: bearer };
    case "stt:Fish Audio": case "tts:Fish Audio": return { url: "https://api.fish.audio/model", headers: { "Authorization": `Bearer ${key}` } };
    case "tts:ElevenLabs": return { url: "https://api.elevenlabs.io/v1/user", headers: { "xi-api-key": key } };
    case "tts:Cartesia": return { url: "https://api.cartesia.ai/voices?limit=1", headers: { "X-API-Key": key, "Cartesia-Version": "2024-06-10" } };
    case "telephony:Telnyx": return { url: "https://api.telnyx.com/v2/available_phone_numbers?filter%5Bcountry_code%5D=US&filter%5Bphone_number_type%5D=local&page%5Bsize%5D=1", headers: bearer };
    case "email:Resend": return { url: "https://api.resend.com/domains", headers: bearer };
    case "email:Postmark": return { url: "https://api.postmarkapp.com/server", headers: { "X-Postmark-Server-Token": key, Accept: "application/json" } };
    default: return null;
  }
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in to test provider connections." }, { status: 401 });
  if (!isTenantAdmin(context)) return NextResponse.json({ error: "Only workspace owners and admins can test provider connections." }, { status: 403 });
  if (!allowRequest(`provider-test:${context.tenantId}`, 8, 60_000)) return NextResponse.json({ error: "Too many provider tests. Please wait a minute." }, { status: 429 });
  const body = await request.json().catch(() => null) as { kind?: string } | null;
  const kind = body?.kind || "";
  if (!isProviderKind(kind)) return NextResponse.json({ error: "Choose a supported provider type." }, { status: 400 });
  const [credential] = await db.select().from(providerCredentials).where(and(eq(providerCredentials.tenantId, context.tenantId), eq(providerCredentials.kind, kind))).limit(1);
  let key: string | undefined;
  try {
    if (credential?.mode === "byok" && credential.keyCiphertext) key = decryptProviderSecret(credential.keyCiphertext);
    if (!key) {
      const envName = `PLATFORM_${kind.toUpperCase()}_KEY`;
      key = process.env[envName];
    }
  } catch {
    return NextResponse.json({ error: "This credential could not be decrypted. Replace the key or contact support." }, { status: 500 });
  }
  if (!key) return NextResponse.json({ error: "No key is configured for this provider. Add a key or switch to a configured platform provider." }, { status: 400 });
  const provider = credential?.provider || process.env[`PLATFORM_${kind.toUpperCase()}_PROVIDER`] || "";
  const target = requestDetails(kind, provider, key);
  if (!target) return NextResponse.json({ error: "A live connection test is not available for this provider yet. The key remains encrypted and can still be saved." }, { status: 501 });

  let status = "connected";
  let message = "Connection verified.";
  try {
    const response = await fetch(target.url, { method: "GET", headers: target.headers, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!response.ok) {
      status = "failing";
      message = response.status === 401 || response.status === 403 ? "The provider rejected this key. Check the key and its permissions." : `Provider returned HTTP ${response.status}. Check the provider account and try again.`;
    }
  } catch {
    status = "failing";
    message = "Could not reach the provider. Check the network and try again.";
  }
  if (credential) {
    await db.update(providerCredentials).set({ status, lastTestedAt: new Date(), lastTestResult: message }).where(eq(providerCredentials.id, credential.id));
  }
  await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "provider.connection_tested", target: kind, details: { provider, status } });
  return NextResponse.json({ ok: status === "connected", kind, provider, status, message, testedAt: new Date().toISOString() }, { status: status === "connected" ? 200 : 422 });
}
