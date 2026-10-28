import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLog, widgetKeys } from "@/db/schema";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

function safeOrigins(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((origin): origin is string => typeof origin === "string").map((origin) => origin.trim().replace(/\/$/, "")).filter((origin) => {
    try { const url = new URL(origin); return (url.protocol === "https:" || url.hostname === "localhost") && origin.length < 256; } catch { return false; }
  }))].slice(0, 20);
}

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ demo: true, widget: { publicKey: "cs_demo_readonly", allowedOrigins: [], active: false } });
  const [widget] = await db.select().from(widgetKeys).where(and(eq(widgetKeys.tenantId, context.tenantId), eq(widgetKeys.active, true))).limit(1);
  return NextResponse.json({ demo: false, widget: widget ? { publicKey: widget.publicKey, allowedOrigins: widget.allowedOrigins, active: widget.active } : null });
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in to create a widget key." }, { status: 401 });
  if (!isTenantAdmin(context)) return NextResponse.json({ error: "Only workspace owners and admins can manage widget keys." }, { status: 403 });
  const body = await request.json().catch(() => null) as { allowedOrigins?: unknown; rotate?: boolean } | null;
  const allowedOrigins = safeOrigins(body?.allowedOrigins);
  const [existing] = await db.select().from(widgetKeys).where(eq(widgetKeys.tenantId, context.tenantId)).limit(1);
  let publicKey = existing?.publicKey;
  if (!publicKey || body?.rotate) publicKey = `cs_live_${randomBytes(24).toString("base64url")}`;
  if (existing) {
    await db.update(widgetKeys).set({ publicKey, allowedOrigins, active: true }).where(eq(widgetKeys.id, existing.id));
    if (!existing.active || body?.rotate) await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: body?.rotate ? "widget_key.rotated" : "widget_key.activated", target: existing.id });
  } else {
    const [created] = await db.insert(widgetKeys).values({ tenantId: context.tenantId, publicKey, allowedOrigins, active: true }).returning({ id: widgetKeys.id });
    await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "widget_key.created", target: created.id });
  }
  return NextResponse.json({ ok: true, widget: { publicKey, allowedOrigins, active: true } });
}
