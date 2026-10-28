import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, resetCodeMatches } from "@/lib/auth-security";
import { allowRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowRequest(`reset:${ip}`, 10)) return NextResponse.json({ error: "Too many attempts. Please wait a minute and try again." }, { status: 429 });
  const body = await request.json().catch(() => null) as { email?: string; code?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase().slice(0, 254) || "";
  const code = (body?.code || "").replace(/\D/g, "").slice(0, 6);
  const password = body?.password || "";
  if (!email || code.length !== 6) return NextResponse.json({ error: "Enter the 6-digit code from your email." }, { status: 400 });
  if (password.length < 8 || password.length > 128) return NextResponse.json({ error: "Use a new password between 8 and 128 characters." }, { status: 400 });

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.resetCodeHash || !user.resetCodeExpiresAt || user.resetCodeExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "That code is not valid or has expired. Request a new one." }, { status: 400 });
  }
  if (user.resetAttempts >= 5) {
    await db.update(users).set({ resetCodeHash: null, resetCodeExpiresAt: null, resetAttempts: 0 }).where(eq(users.id, user.id));
    return NextResponse.json({ error: "Too many wrong codes. Request a new code." }, { status: 400 });
  }
  if (!resetCodeMatches(email, code, user.resetCodeHash)) {
    await db.update(users).set({ resetAttempts: sql`${users.resetAttempts} + 1` }).where(eq(users.id, user.id));
    return NextResponse.json({ error: "That code is not correct. Check the email and try again." }, { status: 400 });
  }

  await db.update(users).set({
    passwordHash: hashPassword(password),
    resetCodeHash: null,
    resetCodeExpiresAt: null,
    resetAttempts: 0,
  }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true, message: "Password updated. Sign in with your new password." });
}
