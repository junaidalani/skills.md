import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLog, integrations } from "@/db/schema";
import { decryptProviderSecret, encryptProviderSecret } from "@/lib/provider-crypto";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

/**
 * Tenant integrations that the call agent can act on: calendar, sheet, webhook.
 * Each row is a Google Apps Script web app (or any https endpoint) that accepts
 * {action, type, company, call_id, caller, secret, data} and answers {ok, message}.
 * The voice service reads these through /api/voice/session-config.
 */

const KIND_LABELS: Record<string, string> = {
  google_calendar: "Google Calendar booking",
  google_sheets: "Google Sheets log",
  webhook: "Webhook / n8n",
};

function readConfig(ciphertext: string | null): { url?: string; secret?: string } {
  if (!ciphertext) return {};
  try {
    const parsed = JSON.parse(decryptProviderSecret(ciphertext)) as { url?: string; secret?: string };
    return { url: parsed.url, secret: parsed.secret };
  } catch {
    return {};
  }
}

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ demo: true, integrations: Object.entries(KIND_LABELS).map(([kind, label]) => ({ kind, label, url: "", status: "not-connected" })) });
  const rows = await db.select().from(integrations).where(eq(integrations.tenantId, context.tenantId));
  return NextResponse.json({
    demo: false,
    integrations: Object.entries(KIND_LABELS).map(([kind, label]) => {
      const row = rows.find((r) => r.kind === kind);
      return { kind, label, url: readConfig(row?.configCiphertext || null).url || "", status: row?.status || "not-connected" };
    }),
  });
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in to connect integrations." }, { status: 401 });
  if (!isTenantAdmin(context)) return NextResponse.json({ error: "Only workspace owners and admins can connect integrations." }, { status: 403 });
  const body = await request.json().catch(() => null) as { kind?: string; url?: string; secret?: string } | null;
  const kind = body?.kind || "";
  if (!KIND_LABELS[kind]) return NextResponse.json({ error: "Choose a supported integration." }, { status: 400 });
  let url: URL;
  try {
    url = new URL(body?.url?.trim() || "");
  } catch {
    return NextResponse.json({ error: "Enter the full https address of your Apps Script web app." }, { status: 400 });
  }
  if (url.protocol !== "https:" || url.href.length > 2000) return NextResponse.json({ error: "The address must be https and under 2000 characters." }, { status: 400 });
  const secret = body?.secret?.trim().slice(0, 200) || "";
  let configCiphertext: string;
  try {
    configCiphertext = encryptProviderSecret(JSON.stringify({ url: url.href, secret }));
  } catch {
    return NextResponse.json({ error: "Credential encryption is not configured. Set MASTER_ENCRYPTION_KEY and try again." }, { status: 503 });
  }
  await db.insert(integrations).values({ tenantId: context.tenantId, kind, configCiphertext, status: "connected" }).onConflictDoUpdate({
    target: [integrations.tenantId, integrations.kind],
    set: { configCiphertext, status: "connected" },
  });
  await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "integration.connected", target: kind, details: { host: url.host } });
  return NextResponse.json({ ok: true, kind, url: url.href, status: "connected" });
}

export async function DELETE(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in to manage integrations." }, { status: 401 });
  if (!isTenantAdmin(context)) return NextResponse.json({ error: "Only workspace owners and admins can change integrations." }, { status: 403 });
  const kind = new URL(request.url).searchParams.get("kind") || "";
  if (!KIND_LABELS[kind]) return NextResponse.json({ error: "Choose a supported integration." }, { status: 400 });
  await db.delete(integrations).where(and(eq(integrations.tenantId, context.tenantId), eq(integrations.kind, kind)));
  await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "integration.disconnected", target: kind });
  return NextResponse.json({ ok: true, kind, status: "not-connected" });
}
