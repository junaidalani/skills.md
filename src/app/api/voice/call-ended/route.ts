import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, calls, leads, phoneNumbers, transcripts, usageEvents } from "@/db/schema";

export const runtime = "nodejs";

type CallPayload = {
  callId?: string;
  to?: string;
  from?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  outcome?: string;
  summary?: string;
  turns?: Array<{ role: string; text: string; at?: string }>;
  lead?: { name?: string; phone?: string; email?: string; reason?: string; fields?: Record<string, unknown> };
};

function constantTimeMatch(a: string, b: string) {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}

export async function POST(request: Request) {
  const secret = process.env.VOICE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Voice call ingestion is not configured. Set VOICE_WEBHOOK_SECRET." }, { status: 503 });
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!constantTimeMatch(supplied, secret)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const payload = await request.json().catch(() => null) as CallPayload | null;
  const to = payload?.to?.trim();
  if (!to || !/^\+?[0-9 ()-]{7,24}$/.test(to)) return NextResponse.json({ error: "A valid dialed number is required." }, { status: 400 });
  const normalizedTo = to.replace(/[\s()-]/g, "");
  const [number] = await db.select().from(phoneNumbers).where(eq(phoneNumbers.e164, normalizedTo)).limit(1);
  if (!number) return NextResponse.json({ error: "No active tenant is assigned to this number." }, { status: 404 });
  if (number.status !== "active") return NextResponse.json({ error: "This number is not active." }, { status: 409 });
  const externalId = payload?.callId?.slice(0, 200);
  if (externalId) {
    const [existing] = await db.select({ id: calls.id }).from(calls).where(and(eq(calls.tenantId, number.tenantId), eq(calls.externalCallId, externalId))).limit(1);
    if (existing) return NextResponse.json({ received: true, duplicate: true, callId: existing.id });
  }
  const durationSec = Math.max(0, Math.min(86_400, Math.floor(payload?.durationSeconds || 0)));
  const startedAt = payload?.startedAt && !Number.isNaN(Date.parse(payload.startedAt)) ? new Date(payload.startedAt) : new Date();
  const endedAt = payload?.endedAt && !Number.isNaN(Date.parse(payload.endedAt)) ? new Date(payload.endedAt) : new Date(startedAt.getTime() + durationSec * 1000);
  const outcome = ["answered", "missed", "blocked", "failed", "transferred", "voicemail"].includes(payload?.outcome || "") ? payload!.outcome! : "answered";
  const [agent] = await db.select({ id: agents.id }).from(agents).where(eq(agents.tenantId, number.tenantId)).limit(1);
  const [savedCall] = await db.insert(calls).values({ tenantId: number.tenantId, agentId: agent?.id || number.agentId, numberId: number.id, externalCallId: externalId || null, fromE164: payload?.from?.slice(0, 30) || null, startedAt, endedAt, durationSec, outcome, summary: payload?.summary?.slice(0, 1200) || null }).returning({ id: calls.id });
  const safeTurns = Array.isArray(payload?.turns) ? payload.turns.slice(0, 100).map((turn) => ({ role: String(turn.role || "caller").slice(0, 20), text: String(turn.text || "").slice(0, 2000), ...(turn.at ? { at: String(turn.at).slice(0, 40) } : {}) })) : [];
  if (safeTurns.length) await db.insert(transcripts).values({ tenantId: number.tenantId, callId: savedCall.id, turns: safeTurns, summary: payload?.summary?.slice(0, 1200) || null });
  if (payload?.lead && (payload.lead.name || payload.lead.phone || payload.lead.reason)) {
    await db.insert(leads).values({ tenantId: number.tenantId, callId: savedCall.id, name: payload.lead.name?.slice(0, 150) || null, phone: payload.lead.phone?.slice(0, 30) || null, email: payload.lead.email?.slice(0, 254) || null, reason: payload.lead.reason?.slice(0, 500) || null, fields: payload.lead.fields || {}, status: "new" });
  }
  const period = `${startedAt.getUTCFullYear()}-${String(startedAt.getUTCMonth() + 1).padStart(2, "0")}`;
  await db.insert(usageEvents).values({ tenantId: number.tenantId, callId: savedCall.id, minutes: Math.ceil(durationSec / 60), period });
  return NextResponse.json({ received: true, callId: savedCall.id, tenantId: number.tenantId });
}
