import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLog, leads } from "@/db/schema";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant-context";
import { demoDashboard } from "@/lib/demo-data";

export const dynamic = "force-dynamic";
const allowedStatuses = new Set(["new", "contacted", "won", "lost"]);

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ demo: true, leads: demoDashboard.leads });
  const rows = await db.select().from(leads).where(eq(leads.tenantId, context.tenantId)).orderBy(desc(leads.createdAt)).limit(200);
  return NextResponse.json({ demo: false, leads: rows.map((lead) => ({ id: lead.id, name: lead.name || "New caller", phone: lead.phone, email: lead.email, reason: lead.reason, status: lead.status, notes: lead.notes, createdAt: lead.createdAt.toISOString() })) });
}

export async function PATCH(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in to update leads." }, { status: 401 });
  if (!isTenantAdmin(context)) return NextResponse.json({ error: "Only workspace owners and admins can update lead status." }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: string; status?: string; notes?: string } | null;
  if (!body?.id || (body.status && !allowedStatuses.has(body.status))) return NextResponse.json({ error: "Choose a valid lead and status." }, { status: 400 });
  const [updated] = await db.update(leads).set({ ...(body.status ? { status: body.status } : {}), ...(typeof body.notes === "string" ? { notes: body.notes.slice(0, 2000) } : {}) }).where(and(eq(leads.id, body.id), eq(leads.tenantId, context.tenantId))).returning({ id: leads.id, status: leads.status });
  if (!updated) return NextResponse.json({ error: "Lead not found in this workspace." }, { status: 404 });
  await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "lead.updated", target: updated.id, details: { status: updated.status } });
  return NextResponse.json({ ok: true, lead: updated });
}
