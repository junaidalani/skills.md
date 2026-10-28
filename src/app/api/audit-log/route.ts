import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { demoDashboard } from "@/lib/demo-data";
import { getTenantContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ demo: true, entries: [
    { id: "demo-audit-1", action: "provider.key_saved", target: "llm", user: "Taylor Morgan", createdAt: "Today, 10:42 AM" },
    { id: "demo-audit-2", action: "agent.settings_updated", target: "agent", user: "Taylor Morgan", createdAt: "Yesterday, 4:18 PM" },
    { id: "demo-audit-3", action: "widget_key.created", target: "website widget", user: "Taylor Morgan", createdAt: "Yesterday, 2:07 PM" },
  ] });
  const rows = await db.select({ id: auditLog.id, action: auditLog.action, target: auditLog.target, createdAt: auditLog.createdAt, userName: users.name }).from(auditLog).leftJoin(users, eq(auditLog.userId, users.id)).where(eq(auditLog.tenantId, context.tenantId)).orderBy(desc(auditLog.createdAt)).limit(100);
  return NextResponse.json({ demo: false, entries: rows.map((row) => ({ id: row.id, action: row.action, target: row.target, user: row.userName || "System", createdAt: row.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) })) }, { headers: { "Cache-Control": "no-store" } });
}
