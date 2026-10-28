import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant-context";

export const runtime = "nodejs";
const prices: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  pro: process.env.STRIPE_PRICE_PRO,
};

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in before changing your plan." }, { status: 401 });
  if (!isTenantAdmin(context)) return NextResponse.json({ error: "Only workspace owners and admins can manage billing." }, { status: 403 });
  const body = await request.json().catch(() => null) as { planId?: string } | null;
  const planId = body?.planId || "";
  if (!Object.hasOwn(prices, planId)) return NextResponse.json({ error: "Choose a valid plan." }, { status: 400 });
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = prices[planId];
  if (!stripeKey || !priceId) return NextResponse.json({ error: "Stripe is not connected yet. Add STRIPE_SECRET_KEY and the matching Stripe price ID to the server environment." }, { status: 503 });
  const baseUrl = process.env.APP_URL || request.headers.get("origin") || "http://localhost:3000";
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("success_url", `${baseUrl}/dashboard?billing=success`);
  form.set("cancel_url", `${baseUrl}/dashboard?billing=cancelled`);
  form.set("client_reference_id", context.tenantId);
  form.set("metadata[tenant_id]", context.tenantId);
  form.set("metadata[plan_id]", planId);
  form.set("subscription_data[metadata][tenant_id]", context.tenantId);
  form.set("subscription_data[metadata][plan_id]", planId);
  form.set("customer_email", context.email);
  const [tenant] = await db.select({ stripeCustomerId: tenants.stripeCustomerId }).from(tenants).where(eq(tenants.id, context.tenantId)).limit(1);
  if (tenant?.stripeCustomerId) {
    form.delete("customer_email");
    form.set("customer", tenant.stripeCustomerId);
  }
  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(12_000), cache: "no-store" }).catch(() => null);
  if (!stripeResponse?.ok) return NextResponse.json({ error: "Stripe could not start checkout. Check the configured price ID and try again." }, { status: 502 });
  const checkout = await stripeResponse.json() as { url?: string };
  if (!checkout.url) return NextResponse.json({ error: "Stripe did not return a checkout link." }, { status: 502 });
  return NextResponse.json({ url: checkout.url });
}
