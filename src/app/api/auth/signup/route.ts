import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, memberships, tenants, users } from "@/db/schema";
import { createSessionToken, hashPassword, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth-security";
import { sendWelcomeEmail } from "@/lib/email";
import { allowRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowRequest(`signup:${ip}`, 5)) return NextResponse.json({ error: "Too many attempts. Please try again in a minute." }, { status: 429 });
  const body = await request.json().catch(() => null) as { name?: string; email?: string; password?: string; businessName?: string; planId?: string } | null;
  const name = body?.name?.trim().slice(0, 100);
  const email = body?.email?.trim().toLowerCase().slice(0, 254);
  const password = body?.password || "";
  const businessName = body?.businessName?.trim().slice(0, 120);
  const planId = ["starter", "growth", "pro"].includes(body?.planId || "") ? body!.planId! : "starter";
  if (!name || !email || !businessName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter your name, a valid email, and your business name." }, { status: 400 });
  }
  if (password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: "Use a password between 8 and 128 characters." }, { status: 400 });
  }
  if (!allowRequest(`signup-email:${email}`, 4)) return NextResponse.json({ error: "Too many attempts for this email. Try again later." }, { status: 429 });
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return NextResponse.json({ error: "An account with this email already exists. Try signing in." }, { status: 409 });

  try {
    const created = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ email, name, passwordHash: hashPassword(password) }).returning();
      const slug = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "workspace"}-${randomUUID().slice(0, 7)}`;
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const [tenant] = await tx.insert(tenants).values({ name: businessName, slug, planId, status: "trial", trialEndsAt }).returning();
      await tx.insert(memberships).values({ userId: user.id, tenantId: tenant.id, role: "owner" });
      await tx.insert(agents).values({
        tenantId: tenant.id,
        name: `${businessName} call assistant`,
        greeting: `Thanks for calling ${businessName}. I’m the AI assistant. How can I help today?`,
        businessInfo: { businessName, businessHours: "Monday–Friday, 9:00 AM–5:00 PM", services: "Add your services here" },
        serviceSettings: { leadCapture: true, voicemail: true, transfer: false, appointmentBooking: false, smsTextBack: false, callRecording: false },
      });
      return { user, tenant };
    });
    await sendWelcomeEmail({ to: created.user.email, name: created.user.name, businessName: created.tenant.name }).catch((error) => {
      console.error("welcome email failed", error instanceof Error ? error.message : error);
    });
    const response = NextResponse.json({ ok: true, user: { name: created.user.name, email: created.user.email }, tenant: { name: created.tenant.name, planId: created.tenant.planId } });
    response.cookies.set(SESSION_COOKIE, createSessionToken(created.user.id, created.tenant.id), sessionCookieOptions);
    return response;
  } catch {
    return NextResponse.json({ error: "We couldn’t create that workspace. Please try again." }, { status: 500 });
  }
}
