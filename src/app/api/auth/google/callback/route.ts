import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, memberships, tenants, users } from "@/db/schema";
import { createSessionToken, hashPassword, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth-security";
import { sendWelcomeEmail } from "@/lib/email";

export const runtime = "nodejs";

const STATE_COOKIE = "agent-caller_oauth_state";

function stateMatches(a: string, b: string) {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && first.length > 0 && timingSafeEqual(first, second);
}

function cookieValue(header: string | null, name: string) {
  for (const part of (header || "").split(";")) {
    const index = part.indexOf("=");
    if (index > -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function slugFor(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "workspace"}-${randomUUID().slice(0, 7)}`;
}

async function workspaceFor(userId: string, name: string) {
  const [existing] = await db
    .select({ tenantId: tenants.id, tenantName: tenants.name })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(eq(memberships.userId, userId))
    .limit(1);
  if (existing) return existing;

  const businessName = `${name}'s workspace`.slice(0, 120);
  return db.transaction(async (tx) => {
    const [tenant] = await tx.insert(tenants).values({
      name: businessName,
      slug: slugFor(name),
      planId: "starter",
      status: "trial",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    }).returning();
    await tx.insert(memberships).values({ userId, tenantId: tenant.id, role: "owner" });
    await tx.insert(agents).values({
      tenantId: tenant.id,
      name: `${businessName} call assistant`,
      greeting: `Thanks for calling ${businessName}. I’m the AI assistant. How can I help today?`,
      businessInfo: { businessName, businessHours: "Monday–Friday, 9:00 AM–5:00 PM", services: "Add your services here" },
      serviceSettings: { leadCapture: true, voicemail: true, transfer: false, appointmentBooking: false, smsTextBack: false, callRecording: false },
    });
    return { tenantId: tenant.id, tenantName: tenant.name };
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?google=${reason}`, request.url));
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("unconfigured");

  const state = url.searchParams.get("state") || "";
  if (!stateMatches(state, cookieValue(request.headers.get("cookie"), STATE_COOKIE))) return fail("state");

  const code = url.searchParams.get("code") || "";
  if (!code) return fail("cancelled");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${url.origin}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  }).catch(() => null);
  if (!tokenResponse?.ok) return fail("failed");
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) return fail("failed");

  const infoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!infoResponse?.ok) return fail("failed");
  const info = await infoResponse.json() as { email?: string; email_verified?: boolean; name?: string };
  const email = info.email?.trim().toLowerCase() || "";
  if (!email || info.email_verified === false) return fail("email");
  const name = (info.name || email.split("@")[0]).slice(0, 100);

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let isNew = false;
  if (!user) {
    isNew = true;
    [user] = await db.insert(users).values({
      email,
      name,
      passwordHash: hashPassword(randomBytes(32).toString("base64url")),
      emailVerifiedAt: new Date(),
    }).returning();
  }

  if (!user) return fail("failed");

  const workspace = await workspaceFor(user.id, name);
  if (isNew) {
    await sendWelcomeEmail({ to: email, name, businessName: workspace.tenantName }).catch((error) => {
      console.error("welcome email failed", error instanceof Error ? error.message : error);
    });
  }

  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.cookies.set(SESSION_COOKIE, createSessionToken(user.id, workspace.tenantId), sessionCookieOptions);
  response.cookies.set(STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
