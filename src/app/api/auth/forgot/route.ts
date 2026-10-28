import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashResetCode } from "@/lib/auth-security";
import { emailReady, sendResetCodeEmail } from "@/lib/email";
import { allowRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

const GENERIC = "If that email has an account, a 6-digit code is on its way. It expires in 15 minutes.";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowRequest(`forgot:${ip}`, 5)) return NextResponse.json({ error: "Too many attempts. Please wait a minute and try again." }, { status: 429 });
  if (!emailReady()) return NextResponse.json({ error: "Email delivery is not configured on this deployment." }, { status: 503 });
  const body = await request.json().catch(() => null) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase().slice(0, 254) || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter the email you signed up with." }, { status: 400 });
  if (!allowRequest(`forgot-email:${email}`, 3)) return NextResponse.json({ error: "Too many attempts for this email. Try again later." }, { status: 429 });

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (user) {
    const code = String(randomInt(100000, 1000000));
    await db.update(users).set({
      resetCodeHash: hashResetCode(email, code),
      resetCodeExpiresAt: new Date(Date.now() + 15 * 60_000),
      resetAttempts: 0,
    }).where(eq(users.id, user.id));
    await sendResetCodeEmail({ to: email, code }).catch((error) => {
      console.error("reset email failed", error instanceof Error ? error.message : error);
    });
  }
  return NextResponse.json({ ok: true, message: GENERIC });
}
