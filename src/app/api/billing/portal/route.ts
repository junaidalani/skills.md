import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant-context";

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in before opening billing." }, { status: 401 });
  if (!isTenantAdmin(context)) return NextResponse.json({ error: "Only workspace owners and admins can manage billing." }, { status: 403 });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "Stripe is not connected yet." }, { status: 503 });
  const [tenant] = await db.select({ stripeCustomerId: tenants.stripeCustomerId }).from(tenants).where(eq(tenants.id, context.tenantId)).limit(1);
  if (!tenant?.stripeCustomerId) return NextResponse.json({ error: "There is no Stripe customer for this workspace yet. Choose a plan to begin Checkout." }, { status: 409 });
  const baseUrl = process.env.APP_URL || request.headers.get("origin") || "http://localhost:3000";
  const form = new URLSearchParams({ customer: tenant.stripeCustomerId, return_url: `${baseUrl}/dashboard?view=billing` });
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(12_000), cache: "no-store" }).catch(() => null);
  if (!response?.ok) return NextResponse.json({ error: "Stripe could not open the customer portal." }, { status: 502 });
  const portal = await response.json() as { url?: string };
  return portal.url ? NextResponse.json({ url: portal.url }) : NextResponse.json({ error: "Stripe did not return a billing portal link." }, { status: 502 });
}
