import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stripeEvents, subscriptions, tenants } from "@/db/schema";

export const runtime = "nodejs";

type StripeEvent = { id: string; type: string; data?: { object?: Record<string, unknown> } };

function validSignature(payload: string, signature: string, secret: string) {
  const parts = signature.split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  return signatures.some((candidate) => {
    const actual = Buffer.from(candidate, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  if (!validSignature(raw, signature, secret)) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  let event: StripeEvent;
  try { event = JSON.parse(raw) as StripeEvent; } catch { return NextResponse.json({ error: "Invalid event payload." }, { status: 400 }); }
  if (!event.id || !event.type) return NextResponse.json({ error: "Missing event identity." }, { status: 400 });
  const [inserted] = await db.insert(stripeEvents).values({ id: event.id, eventType: event.type }).onConflictDoNothing().returning({ id: stripeEvents.id });
  if (!inserted) return NextResponse.json({ received: true, duplicate: true });

  const object = event.data?.object || {};
  const metadata = object.metadata && typeof object.metadata === "object" ? object.metadata as Record<string, unknown> : {};
  const tenantId = typeof metadata.tenant_id === "string" ? metadata.tenant_id : "";
  const planId = typeof metadata.plan_id === "string" ? metadata.plan_id : "starter";
  const customerId = typeof object.customer === "string" ? object.customer : "";
  const subscriptionId = typeof object.subscription === "string" ? object.subscription : typeof object.id === "string" && event.type.startsWith("customer.subscription.") ? object.id : "";
  const status = typeof object.status === "string" ? object.status : "active";
  const periodStart = typeof object.current_period_start === "number" ? new Date(object.current_period_start * 1000) : null;
  const periodEnd = typeof object.current_period_end === "number" ? new Date(object.current_period_end * 1000) : null;

  if (event.type === "checkout.session.completed") {
    const sessionTenant = tenantId || (typeof object.client_reference_id === "string" ? object.client_reference_id : "");
    if (sessionTenant) {
      await db.update(tenants).set({ planId, status: "active", ...(customerId ? { stripeCustomerId: customerId } : {}) }).where(eq(tenants.id, sessionTenant));
      if (subscriptionId) await db.insert(subscriptions).values({ tenantId: sessionTenant, stripeSubscriptionId: subscriptionId, status: "active", currentPeriodStart: periodStart, currentPeriodEnd: periodEnd }).onConflictDoUpdate({ target: subscriptions.tenantId, set: { stripeSubscriptionId: subscriptionId, status: "active", currentPeriodStart: periodStart, currentPeriodEnd: periodEnd } });
    }
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created" || event.type === "customer.subscription.deleted") {
    const [tenant] = tenantId ? await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1) : customerId ? await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.stripeCustomerId, customerId)).limit(1) : [];
    if (tenant) {
      const nextStatus = event.type === "customer.subscription.deleted" ? "cancelled" : status;
      await db.insert(subscriptions).values({ tenantId: tenant.id, stripeSubscriptionId: subscriptionId || null, status: nextStatus, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd }).onConflictDoUpdate({ target: subscriptions.tenantId, set: { stripeSubscriptionId: subscriptionId || null, status: nextStatus, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd } });
      await db.update(tenants).set({ status: nextStatus === "active" || nextStatus === "trialing" ? "active" : nextStatus === "past_due" ? "past_due" : "suspended" }).where(eq(tenants.id, tenant.id));
    }
  }
  if (event.type === "invoice.paid" && customerId) await db.update(tenants).set({ status: "active" }).where(eq(tenants.stripeCustomerId, customerId));
  if (event.type === "invoice.payment_failed" && customerId) await db.update(tenants).set({ status: "past_due" }).where(eq(tenants.stripeCustomerId, customerId));
  return NextResponse.json({ received: true });
}
