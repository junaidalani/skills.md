import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { memberships, tenants, users } from "@/db/schema";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth-security";

export type TenantContext = {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  userName: string;
  tenantName: string;
  tenantSlug: string;
  planId: string;
  tenantStatus: string;
};

export async function getTenantContext(): Promise<TenantContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = readSessionToken(token);
  if (!session) return null;
  const [context] = await db
    .select({
      userId: users.id,
      tenantId: tenants.id,
      role: memberships.role,
      email: users.email,
      userName: users.name,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      planId: tenants.planId,
      tenantStatus: tenants.status,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(and(eq(memberships.userId, session.userId), eq(memberships.tenantId, session.tenantId)))
    .limit(1);
  return context ?? null;
}

export function isTenantAdmin(context: TenantContext | null) {
  return context?.role === "owner" || context?.role === "admin";
}
