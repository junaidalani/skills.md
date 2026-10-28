import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, tenants, users } from "@/db/schema";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from "@/lib/auth-security";
import { allowRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase() || "";
  const password = body?.password || "";
  if (!allowRequest(`login:${ip}:${email}`, 5)) return NextResponse.json({ error: "Too many attempts. Please wait a minute and try again." }, { status: 429 });
  if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Those details don’t match an account." }, { status: 401 });
  }
  const [membership] = await db
    .select({ tenantId: tenants.id, tenantName: tenants.name })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(and(eq(memberships.userId, user.id), eq(tenants.status, "active")))
    .limit(1);
  const [fallbackMembership] = membership ? [membership] : await db
    .select({ tenantId: tenants.id, tenantName: tenants.name })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(eq(memberships.userId, user.id))
    .limit(1);
  if (!fallbackMembership) return NextResponse.json({ error: "This account has no workspace. Contact support." }, { status: 403 });

  const response = NextResponse.json({ ok: true, user: { name: user.name, email: user.email }, tenant: { name: fallbackMembership.tenantName } });
  response.cookies.set(SESSION_COOKIE, createSessionToken(user.id, fallbackMembership.tenantId), sessionCookieOptions);
  return response;
}
