import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, phoneNumbers, tenants, widgetKeys } from "@/db/schema";
import { allowRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!/^cs_live_[A-Za-z0-9_-]{20,80}$/.test(key) || !allowRequest(`widget:${ip}:${key.slice(-6)}`, 40, 60_000)) return NextResponse.json({ error: "Widget is unavailable." }, { status: 404 });
  const origin = request.headers.get("origin")?.replace(/\/$/, "") || "";
  const [widget] = await db.select().from(widgetKeys).where(and(eq(widgetKeys.publicKey, key), eq(widgetKeys.active, true))).limit(1);
  const allowedOrigins = widget?.allowedOrigins || [];
  if (!widget || !origin || !allowedOrigins.includes(origin)) return NextResponse.json({ error: "This website is not on the widget allowlist." }, { status: 403, headers: { "Access-Control-Allow-Origin": "null", Vary: "Origin" } });
  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, widget.tenantId)).limit(1);
  const [agent] = await db.select({ greeting: agents.greeting, active: agents.active }).from(agents).where(eq(agents.tenantId, widget.tenantId)).limit(1);
  const [number] = await db.select({ e164: phoneNumbers.e164 }).from(phoneNumbers).where(and(eq(phoneNumbers.tenantId, widget.tenantId), eq(phoneNumbers.status, "active"))).limit(1);
  return NextResponse.json({ businessName: tenant?.name || "Business", greeting: agent?.active ? agent.greeting : "Our phone assistant is currently unavailable.", phone: number?.e164 || null, active: agent?.active ?? false }, { headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "public, max-age=60, stale-while-revalidate=300", Vary: "Origin" } });
}
