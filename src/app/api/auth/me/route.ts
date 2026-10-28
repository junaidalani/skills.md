import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, user: { id: context.userId, name: context.userName, email: context.email }, tenant: { id: context.tenantId, name: context.tenantName, slug: context.tenantSlug, planId: context.planId, status: context.tenantStatus }, role: context.role });
}
