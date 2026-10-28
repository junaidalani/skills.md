import { and, desc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, calls, leads, phoneNumbers, providerCredentials } from "@/db/schema";
import { demoDashboard } from "@/lib/demo-data";
import { providerDefaults } from "@/lib/provider-catalog";
import { planFor } from "@/lib/plans";
import { getTenantContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

const maskedPhone = (phone: string | null) => phone ? `${phone.slice(0, Math.max(0, phone.length - 4)).replace(/\d/g, "•")}${phone.slice(-4)}` : "Private caller";

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json(demoDashboard, { headers: { "Cache-Control": "no-store" } });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [agent] = await db.select().from(agents).where(eq(agents.tenantId, context.tenantId)).limit(1);
  const monthCalls = await db.select().from(calls).where(and(eq(calls.tenantId, context.tenantId), gte(calls.startedAt, monthStart))).orderBy(desc(calls.startedAt)).limit(1500);
  const recentLeads = await db.select().from(leads).where(eq(leads.tenantId, context.tenantId)).orderBy(desc(leads.createdAt)).limit(40);
  const providerRows = await db.select().from(providerCredentials).where(eq(providerCredentials.tenantId, context.tenantId));
  const numbers = await db.select().from(phoneNumbers).where(eq(phoneNumbers.tenantId, context.tenantId));
  const minutesThisMonth = monthCalls.reduce((total, call) => total + Math.ceil((call.durationSec || 0) / 60), 0);
  const todayCalls = monthCalls.filter((call) => call.startedAt >= today);
  const answered = monthCalls.filter((call) => !["missed", "failed", "blocked"].includes(call.outcome)).length;
  const weeklyCalls = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index));
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    return monthCalls.filter((call) => call.startedAt >= day && call.startedAt < next).length;
  });
  const callList = monthCalls.slice(0, 8).map((call) => ({
    id: call.id,
    name: call.summary?.split(/[.!?]/)[0]?.slice(0, 34) || "Inbound call",
    phone: maskedPhone(call.fromE164),
    reason: call.summary || call.outcome.replaceAll("_", " "),
    duration: `${Math.floor(call.durationSec / 60)}:${String(call.durationSec % 60).padStart(2, "0")}`,
    time: call.startedAt.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }),
    outcome: call.outcome.replaceAll("_", " "),
    initials: "IN",
  }));
  const leadList = recentLeads.map((lead) => ({
    id: lead.id,
    name: lead.name || "New caller",
    phone: maskedPhone(lead.phone),
    reason: lead.reason || "Call follow-up",
    status: lead.status,
    createdAt: lead.createdAt.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" }),
  }));
  const providerHealth = Object.entries(providerDefaults).filter(([kind]) => kind !== "email").map(([kind, defaults]) => {
    const saved = providerRows.find((row) => row.kind === kind);
    return { kind, ...defaults, provider: saved?.provider || defaults.provider, model: saved?.model || defaults.model, status: saved ? saved.status === "connected" ? "Connected" : saved.status === "failing" ? "Needs attention" : "Saved · not tested" : "Not connected", last4: saved?.keyLast4 ? `•••• ${saved.keyLast4}` : "" };
  });

  return NextResponse.json({
    demo: false,
    tenantName: context.tenantName,
    userName: context.userName,
    planId: context.planId,
    tenantStatus: context.tenantStatus,
    stats: {
      callsToday: todayCalls.length,
      callsChange: 0,
      minutesThisMonth,
      minutesIncluded: planFor(context.planId),
      leadsCaptured: recentLeads.length,
      leadsChange: 0,
      answerRate: monthCalls.length ? Math.round((answered / monthCalls.length) * 100) : 0,
    },
    weeklyCalls,
    calls: callList,
    leads: leadList,
    providerHealth,
    numbers: numbers.map((number) => ({ id: number.id, e164: number.e164, status: number.status, label: number.forwardFrom ? `Forwarded from ${maskedPhone(number.forwardFrom)}` : "Business line" })),
    agent: agent ? {
      name: agent.name,
      greeting: agent.greeting,
      businessName: String(agent.businessInfo?.businessName || context.tenantName),
      businessHours: String(agent.businessInfo?.businessHours || "Set your business hours"),
      services: String(agent.businessInfo?.services || "Add your services"),
      tone: String(agent.voiceSettings?.tone || "Warm and professional"),
      language: agent.language,
      active: agent.active,
      businessInfo: agent.businessInfo || {},
      voiceSettings: agent.voiceSettings || {},
      transferRules: agent.transferRules || {},
      afterHours: agent.afterHours || {},
      serviceSettings: agent.serviceSettings || {},
    } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
