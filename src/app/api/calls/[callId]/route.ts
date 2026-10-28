import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { calls, transcripts } from "@/db/schema";
import { getTenantContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  const context = await getTenantContext();
  if (!context) {
    if (callId.startsWith("demo-call-")) return NextResponse.json({ demo: true, call: { summary: "Customer called to request help with an air-conditioning repair. The assistant collected the service address and preferred callback time.", fromE164: "+14155550127", recordingUrl: null, turns: [
      { role: "assistant", text: "Thanks for calling Northstar Heating & Air. I’m the AI assistant. How can I help today?" },
      { role: "caller", text: "Our air conditioning stopped cooling this morning." },
      { role: "assistant", text: "I’m sorry you’re dealing with that. Is the system running, or has it stopped completely?" },
      { role: "caller", text: "It’s running, just blowing warm air. We’re at 22 Pine Street." },
      { role: "assistant", text: "Thank you. I’ve noted the address and that the system is blowing warm air. What’s the best number and time for the team to call you back?" },
    ] } });
    return NextResponse.json({ error: "Sign in to review call details." }, { status: 401 });
  }
  const [call] = await db.select().from(calls).where(and(eq(calls.id, callId), eq(calls.tenantId, context.tenantId))).limit(1);
  if (!call) return NextResponse.json({ error: "Call not found in this workspace." }, { status: 404 });
  const [transcript] = await db.select().from(transcripts).where(and(eq(transcripts.callId, call.id), eq(transcripts.tenantId, context.tenantId))).limit(1);
  return NextResponse.json({ demo: false, call: { id: call.id, summary: call.summary, fromE164: call.fromE164, outcome: call.outcome, durationSec: call.durationSec, startedAt: call.startedAt.toISOString(), recordingUrl: call.recordingUrl, turns: transcript?.turns || [], transcriptSummary: transcript?.summary || null } }, { headers: { "Cache-Control": "no-store" } });
}
