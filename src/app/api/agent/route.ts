import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditLog } from "@/db/schema";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
const asObject = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in to manage your agent." }, { status: 401 });
  const [agent] = await db.select().from(agents).where(eq(agents.tenantId, context.tenantId)).limit(1);
  if (!agent) return NextResponse.json({ error: "No agent has been created yet." }, { status: 404 });
  return NextResponse.json({ agent });
}

export async function PATCH(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in to manage your agent." }, { status: 401 });
  if (!isTenantAdmin(context)) return NextResponse.json({ error: "Only workspace owners and admins can edit the agent." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Enter valid agent settings." }, { status: 400 });
  const updates: Partial<typeof agents.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string") updates.name = body.name.trim().slice(0, 120);
  if (typeof body.greeting === "string") {
    if (!body.greeting.trim() || body.greeting.length > 1200) return NextResponse.json({ error: "Your greeting must be between 1 and 1,200 characters." }, { status: 400 });
    updates.greeting = body.greeting.trim();
  }
  if (typeof body.systemPrompt === "string") {
    if (body.systemPrompt.length > 5000) return NextResponse.json({ error: "The agent instructions must be under 5,000 characters." }, { status: 400 });
    updates.systemPrompt = body.systemPrompt.trim();
  }
  if (typeof body.language === "string") updates.language = body.language.slice(0, 30);
  if (typeof body.active === "boolean") updates.active = body.active;
  const businessInfo = asObject(body.businessInfo);
  const voiceSettings = asObject(body.voiceSettings);
  const transferRules = asObject(body.transferRules);
  const afterHours = asObject(body.afterHours);
  const serviceSettings = asObject(body.serviceSettings);
  if (businessInfo) updates.businessInfo = businessInfo;
  if (voiceSettings) updates.voiceSettings = voiceSettings;
  if (transferRules) updates.transferRules = transferRules;
  if (afterHours) updates.afterHours = afterHours;
  if (serviceSettings) updates.serviceSettings = serviceSettings;
  const [existing] = await db.select({ id: agents.id }).from(agents).where(eq(agents.tenantId, context.tenantId)).limit(1);
  if (!existing) return NextResponse.json({ error: "Agent setup is incomplete. Please refresh your workspace." }, { status: 404 });
  const [updated] = await db.update(agents).set(updates).where(eq(agents.id, existing.id)).returning();
  await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "agent.settings_updated", target: updated.id });
  return NextResponse.json({ ok: true, agent: updated });
}
