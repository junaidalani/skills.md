import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLog, providerCredentials } from "@/db/schema";
import { encryptProviderSecret, lastFour } from "@/lib/provider-crypto";
import { isProviderKind, providerCatalog, providerDefaults } from "@/lib/provider-catalog";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getTenantContext();
  if (!context) {
    return NextResponse.json({ demo: true, providers: Object.entries(providerDefaults).map(([kind, details]) => ({ kind, ...details, mode: "platform", status: "Demo connection", last4: "••••" })) });
  }
  const rows = await db.select().from(providerCredentials).where(eq(providerCredentials.tenantId, context.tenantId));
  const providers = Object.entries(providerDefaults).map(([kind, details]) => {
    const saved = rows.find((row) => row.kind === kind);
    return { kind, ...details, ...(saved ? { provider: saved.provider, model: saved.model || details.model, mode: saved.mode, status: saved.status, last4: saved.keyLast4 ? `•••• ${saved.keyLast4}` : "" } : { mode: "platform", status: "Using platform default", last4: "" }), lastTestedAt: saved?.lastTestedAt || null };
  });
  return NextResponse.json({ demo: false, providers });
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in to manage provider settings." }, { status: 401 });
  if (!isTenantAdmin(context)) return NextResponse.json({ error: "Only workspace owners and admins can change provider keys." }, { status: 403 });
  const body = await request.json().catch(() => null) as { kind?: string; provider?: string; model?: string; apiKey?: string; mode?: string } | null;
  const kind = body?.kind || "";
  const provider = body?.provider?.trim() || "";
  if (!isProviderKind(kind)) return NextResponse.json({ error: "Choose a supported provider type." }, { status: 400 });
  if (body?.mode === "platform") {
    await db.insert(providerCredentials).values({ tenantId: context.tenantId, kind, provider: provider || providerDefaults[kind].provider, model: body.model?.slice(0, 120) || null, keyCiphertext: null, keyLast4: null, mode: "platform", status: "not-tested", updatedAt: new Date() }).onConflictDoUpdate({ target: [providerCredentials.tenantId, providerCredentials.kind], set: { provider: provider || providerDefaults[kind].provider, model: body.model?.slice(0, 120) || null, keyCiphertext: null, keyLast4: null, mode: "platform", status: "not-tested", updatedAt: new Date() } });
    await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "provider.switched_to_platform", target: kind });
    return NextResponse.json({ ok: true, kind, mode: "platform", status: "Using platform default", last4: "" });
  }
  const apiKey = body?.apiKey?.trim() || "";
  if (!apiKey || apiKey.length < 8 || apiKey.length > 500) return NextResponse.json({ error: "Enter a valid provider key between 8 and 500 characters." }, { status: 400 });
  if (!(providerCatalog[kind] as readonly string[]).includes(provider)) return NextResponse.json({ error: "Choose a supported provider for this category." }, { status: 400 });
  let keyCiphertext: string;
  try { keyCiphertext = encryptProviderSecret(apiKey); } catch { return NextResponse.json({ error: "Credential encryption is not configured. Set MASTER_ENCRYPTION_KEY and try again." }, { status: 503 }); }
  const keyLast4 = lastFour(apiKey);
  await db.insert(providerCredentials).values({ tenantId: context.tenantId, kind, provider, model: body?.model?.trim().slice(0, 120) || null, keyCiphertext, keyLast4, mode: "byok", status: "not-tested", updatedAt: new Date() }).onConflictDoUpdate({
    target: [providerCredentials.tenantId, providerCredentials.kind],
    set: { provider, model: body?.model?.trim().slice(0, 120) || null, keyCiphertext, keyLast4, mode: "byok", status: "not-tested", lastTestedAt: null, lastTestResult: null, updatedAt: new Date() },
  });
  await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "provider.key_saved", target: kind, details: { provider, keyLast4 } });
  return NextResponse.json({ ok: true, kind, provider, model: body?.model?.trim().slice(0, 120) || null, mode: "byok", status: "Saved · not tested", last4: `•••• ${keyLast4}` });
}

export async function DELETE(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in to manage provider settings." }, { status: 401 });
  if (!isTenantAdmin(context)) return NextResponse.json({ error: "Only workspace owners and admins can change provider keys." }, { status: 403 });
  const kind = new URL(request.url).searchParams.get("kind") || "";
  if (!isProviderKind(kind)) return NextResponse.json({ error: "Choose a supported provider type." }, { status: 400 });
  await db.delete(providerCredentials).where(and(eq(providerCredentials.tenantId, context.tenantId), eq(providerCredentials.kind, kind)));
  await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "provider.key_removed", target: kind });
  return NextResponse.json({ ok: true, kind, status: "Using platform default", last4: "" });
}
