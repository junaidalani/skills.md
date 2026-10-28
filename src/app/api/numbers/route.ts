import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, auditLog, integrations, phoneNumbers, providerCredentials } from "@/db/schema";
import { decryptProviderSecret, encryptProviderSecret } from "@/lib/provider-crypto";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant-context";
import { demoDashboard } from "@/lib/demo-data";

export const runtime = "nodejs";
const planCaps: Record<string, number> = { starter: 1, growth: 3, pro: 8 };
type TelnyxCandidate = { phoneNumber: string; locality: string; region: string; monthlyCost: number | null; upfrontCost: number | null };
type TelnyxNumberResponse = { data?: Array<Record<string, unknown>> };
type TelnyxOrderResponse = { data?: { id?: string; status?: string; phone_numbers?: Array<{ id?: string; phone_number?: string }> } };

type TelnyxOwnedNumber = { id?: string; phone_number?: string; status?: string; connection_id?: string };

async function getTelnyxCredentials(tenantId: string): Promise<{ apiKey: string; connectionId: string | null } | null> {
  const [stored] = await db.select().from(integrations).where(and(eq(integrations.tenantId, tenantId), eq(integrations.kind, "telnyx-credentials"))).limit(1);
  if (stored?.configCiphertext) {
    try {
      const parsed = JSON.parse(decryptProviderSecret(stored.configCiphertext)) as { api_key?: string; connection_id?: string };
      if (parsed.api_key) return { apiKey: parsed.api_key, connectionId: parsed.connection_id || null };
    } catch { /* fall through to the platform key */ }
  }
  const apiKey = process.env.TELNYX_API_KEY || process.env.PLATFORM_TELEPHONY_KEY || null;
  return apiKey ? { apiKey, connectionId: process.env.TELNYX_CONNECTION_ID || null } : null;
}

async function getTelnyxKey(tenantId: string) {
  return (await getTelnyxCredentials(tenantId))?.apiKey ?? null;
}

async function telnyxOwnedNumber(apiKey: string, phoneNumber: string): Promise<TelnyxOwnedNumber | null> {
  const response = await fetch(`https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(phoneNumber)}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(12_000), cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  const result = await response.json() as { data?: TelnyxOwnedNumber[] };
  return result.data?.find((row) => row.phone_number === phoneNumber) || null;
}

// A number only reaches our voice server when it sits on a Call Control application whose webhook
// points at /telnyx/webhook. Reuse the workspace's app; create one when it does not exist yet.
async function telnyxCallControlApp(apiKey: string, tenantSlug: string, webhookUrl: string, existing: string | null): Promise<string | null> {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" };
  if (existing) {
    // Keep a reused application pointed at the current voice server.
    await fetch(`https://api.telnyx.com/v2/call_control_applications/${encodeURIComponent(existing)}`, { method: "PATCH", headers, body: JSON.stringify({ webhook_event_url: webhookUrl }), signal: AbortSignal.timeout(12_000), cache: "no-store" }).catch(() => null);
    return existing;
  }
  const response = await fetch("https://api.telnyx.com/v2/call_control_applications", {
    method: "POST",
    headers,
    body: JSON.stringify({ application_name: `Agent Caller ${tenantSlug}`.slice(0, 60), webhook_event_url: webhookUrl, webhook_api_version: "2" }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch(() => null);
  if (response?.ok) {
    const created = await response.json() as { data?: { id?: string } };
    return created.data?.id || null;
  }
  // Some Telnyx plans allow a single Call Control application: reuse the existing one and repoint its webhook.
  const list = await fetch("https://api.telnyx.com/v2/call_control_applications?page[size]=50", { headers, signal: AbortSignal.timeout(12_000), cache: "no-store" }).catch(() => null);
  if (!list?.ok) return null;
  const apps = await list.json() as { data?: Array<{ id?: string }> };
  const reuse = apps.data?.[0]?.id;
  if (!reuse) return null;
  const patched = await fetch(`https://api.telnyx.com/v2/call_control_applications/${encodeURIComponent(reuse)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ webhook_event_url: webhookUrl }),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  }).catch(() => null);
  return patched?.ok ? reuse : null;
}

function readCandidate(row: Record<string, unknown>): TelnyxCandidate | null {
  const phoneNumber = typeof row.phone_number === "string" ? row.phone_number : "";
  if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) return null;
  const regionInfo = row.region_information && typeof row.region_information === "object" ? row.region_information as Record<string, unknown> : {};
  const cost = row.cost_information && typeof row.cost_information === "object" ? row.cost_information as Record<string, unknown> : {};
  const monthlyValue = Number(cost.monthly_cost ?? cost.monthly_recurring_cost);
  const upfrontValue = Number(cost.upfront_cost ?? cost.setup_cost);
  return {
    phoneNumber,
    locality: String(regionInfo.region_name || regionInfo.locality || "Local number"),
    region: String(regionInfo.region_code || regionInfo.administrative_area || "United States"),
    monthlyCost: Number.isFinite(monthlyValue) && monthlyValue > 0 ? monthlyValue : null,
    upfrontCost: Number.isFinite(upfrontValue) && upfrontValue > 0 ? upfrontValue : null,
  };
}

export async function GET(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ demo: true, numbers: demoDashboard.numbers, request: null, candidates: [], voiceUrl: "" });
  const url = new URL(request.url);
  const areaCode = (url.searchParams.get("areaCode") || "").replace(/\D/g, "").slice(0, 5);
  if (url.searchParams.get("search") === "1") {
    if (areaCode && !/^\d{3,5}$/.test(areaCode)) return NextResponse.json({ error: "Enter a 3–5 digit area code." }, { status: 400 });
    const key = await getTelnyxKey(context.tenantId);
    if (!key) return NextResponse.json({ error: "Connect a Telnyx key under Providers & keys before searching live inventory." }, { status: 503 });
    const params = new URLSearchParams({ "filter[country_code]": "US", "filter[phone_number_type]": "local", "filter[limit]": "5", "filter[features]": "voice" });
    if (areaCode) params.set("filter[national_destination_code]", areaCode);
    const response = await fetch(`https://api.telnyx.com/v2/available_phone_numbers?${params.toString()}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(12_000), cache: "no-store" }).catch(() => null);
    if (!response?.ok) return NextResponse.json({ error: response?.status === 401 || response?.status === 403 ? "Telnyx rejected this key or its number-search permissions." : "Telnyx inventory search is unavailable. Check the key and try again." }, { status: 502 });
    const result = await response.json() as TelnyxNumberResponse;
    const candidates = (result.data || []).map(readCandidate).filter((item): item is TelnyxCandidate => Boolean(item)).slice(0, 5);
    try {
      const configCiphertext = encryptProviderSecret(JSON.stringify({ candidates, searchedAt: new Date().toISOString() }));
      await db.insert(integrations).values({ tenantId: context.tenantId, kind: "telnyx-number-search", configCiphertext, status: "searched" }).onConflictDoUpdate({ target: [integrations.tenantId, integrations.kind], set: { configCiphertext, status: "searched" } });
    } catch { return NextResponse.json({ error: "Search results could not be saved securely. Try again." }, { status: 503 }); }
    return NextResponse.json({ candidates, searchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  }

  const numbers = await db.select().from(phoneNumbers).where(eq(phoneNumbers.tenantId, context.tenantId)).orderBy(desc(phoneNumbers.createdAt));
  const [numberRequest] = await db.select({ status: integrations.status }).from(integrations).where(and(eq(integrations.tenantId, context.tenantId), eq(integrations.kind, "number-request"))).limit(1);
  return NextResponse.json({ demo: false, numbers, request: numberRequest?.status || null, candidates: [], voiceUrl: process.env.VOICE_PUBLIC_URL || "" });
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in to manage phone numbers." }, { status: 401 });
  if (!isTenantAdmin(context)) return NextResponse.json({ error: "Only workspace owners and admins can manage phone numbers." }, { status: 403 });
  const body = await request.json().catch(() => null) as { action?: string; areaCode?: string; country?: string; forwardFrom?: string; phoneNumber?: string; confirmPurchase?: boolean; numberId?: string; accountSid?: string; authToken?: string; apiKey?: string } | null;

  if (body?.action === "connect") {
    // Bring your own Twilio number: verify it exists on the account, save the credentials, mark it active.
    const phoneNumber = (body.phoneNumber || "").trim();
    const accountSid = (body.accountSid || "").trim();
    const authToken = (body.authToken || "").trim();
    if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) return NextResponse.json({ error: "Enter the number in international format, for example +14155550138." }, { status: 400 });
    if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid)) return NextResponse.json({ error: "That Account SID does not look right. Copy it from the Twilio console." }, { status: 400 });
    if (authToken.length < 16 || authToken.length > 200) return NextResponse.json({ error: "Paste the Twilio Auth Token from the console." }, { status: 400 });
    const existing = await db.select({ id: phoneNumbers.id, status: phoneNumbers.status }).from(phoneNumbers).where(eq(phoneNumbers.tenantId, context.tenantId));
    if (existing.some((number) => number.status !== "failed") && existing.filter((number) => number.status !== "failed").length >= (planCaps[context.planId] || 1)) return NextResponse.json({ error: `Your ${context.planId} plan allows up to ${planCaps[context.planId] || 1} numbers. Change plans before adding another.` }, { status: 409 });
    const lookup = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`, { headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` }, signal: AbortSignal.timeout(15_000), cache: "no-store" }).catch(() => null);
    if (!lookup) return NextResponse.json({ error: "Could not reach Twilio. Try again." }, { status: 502 });
    if (lookup.status === 401) return NextResponse.json({ error: "Twilio rejected that Account SID and Auth Token." }, { status: 400 });
    if (!lookup.ok) return NextResponse.json({ error: "Twilio could not confirm this number. Check the account and try again." }, { status: 502 });
    const found = await lookup.json() as { incoming_phone_numbers?: unknown[] };
    if (!found.incoming_phone_numbers?.length) return NextResponse.json({ error: "That number is not on this Twilio account." }, { status: 404 });
    const [agent] = await db.select({ id: agents.id }).from(agents).where(eq(agents.tenantId, context.tenantId)).limit(1);
    let configured: string;
    try { configured = encryptProviderSecret(JSON.stringify({ account_sid: accountSid, auth_token: authToken, phone_number: phoneNumber })); }
    catch { return NextResponse.json({ error: "Credential encryption is not configured. Set MASTER_ENCRYPTION_KEY and try again." }, { status: 503 }); }
    try {
      await db.insert(phoneNumbers).values({ tenantId: context.tenantId, agentId: agent?.id || null, e164: phoneNumber, status: "active" });
    } catch { return NextResponse.json({ error: "This number is already connected to a workspace." }, { status: 409 }); }
    await db.insert(providerCredentials).values({ tenantId: context.tenantId, kind: "telephony", provider: "Twilio", keyCiphertext: configured, keyLast4: accountSid.slice(-4), mode: "byok", status: "connected", updatedAt: new Date() }).onConflictDoUpdate({
      target: [providerCredentials.tenantId, providerCredentials.kind],
      set: { provider: "Twilio", keyCiphertext: configured, keyLast4: accountSid.slice(-4), mode: "byok", status: "connected", updatedAt: new Date() },
    });
    await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "number.connected_byo", target: phoneNumber, details: { provider: "twilio" } });
    return NextResponse.json({ ok: true, e164: phoneNumber, provider: "twilio", voiceUrl: `${process.env.VOICE_PUBLIC_URL || ""}/twilio/voice` });
  }

  if (body?.action === "connect-telnyx") {
    // Bring your own Telnyx number: verify it on the key's account, route it to our voice app, save the key.
    const phoneNumber = (body.phoneNumber || "").trim();
    const apiKey = (body.apiKey || "").trim();
    if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) return NextResponse.json({ error: "Enter the number in international format, for example +15519007793." }, { status: 400 });
    if (apiKey.length < 16 || apiKey.length > 500) return NextResponse.json({ error: "Paste a Telnyx API key from the Telnyx portal." }, { status: 400 });
    const [already] = await db.select({ id: phoneNumbers.id, tenantId: phoneNumbers.tenantId }).from(phoneNumbers).where(eq(phoneNumbers.e164, phoneNumber)).limit(1);
    if (already && already.tenantId !== context.tenantId) return NextResponse.json({ error: "This number is already connected to a workspace." }, { status: 409 });
    const existing = await db.select({ id: phoneNumbers.id, e164: phoneNumbers.e164, status: phoneNumbers.status }).from(phoneNumbers).where(eq(phoneNumbers.tenantId, context.tenantId));
    if (!already && existing.some((number) => number.status !== "failed") && existing.filter((number) => number.status !== "failed").length >= (planCaps[context.planId] || 1)) return NextResponse.json({ error: `Your ${context.planId} plan allows up to ${planCaps[context.planId] || 1} numbers. Change plans before adding another.` }, { status: 409 });
    const owned = await telnyxOwnedNumber(apiKey, phoneNumber);
    if (!owned?.id) return NextResponse.json({ error: "That number is not on this Telnyx account, or the key cannot list numbers." }, { status: 404 });
    const webhookUrl = process.env.VOICE_PUBLIC_URL ? `${process.env.VOICE_PUBLIC_URL.replace(/\/$/, "")}/telnyx/webhook` : "";
    let connectionId: string | null = null;
    let warning = "";
    if (webhookUrl) {
      const [stored] = await db.select({ configCiphertext: integrations.configCiphertext }).from(integrations).where(and(eq(integrations.tenantId, context.tenantId), eq(integrations.kind, "telnyx-credentials"))).limit(1);
      let previous: string | null = null;
      try { if (stored?.configCiphertext) previous = (JSON.parse(decryptProviderSecret(stored.configCiphertext)) as { connection_id?: string }).connection_id || null; } catch { previous = null; }
      const appId = await telnyxCallControlApp(apiKey, context.tenantSlug, webhookUrl, previous);
      if (appId) {
        const attached = await fetch(`https://api.telnyx.com/v2/phone_numbers/${encodeURIComponent(owned.id)}`, { method: "PATCH", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ connection_id: appId }), signal: AbortSignal.timeout(12_000), cache: "no-store" }).catch(() => null);
        if (attached?.ok) connectionId = appId;
        else warning = "The key could not move this number to the agent's call application; assign it to a Call Control app with this webhook in Telnyx.";
      } else warning = "Could not create a Telnyx call application; assign the number to a Call Control app with this webhook in Telnyx.";
    } else warning = "VOICE_PUBLIC_URL is not configured, so inbound calls cannot reach the agent yet.";
    let credentialCiphertext: string;
    try { credentialCiphertext = encryptProviderSecret(JSON.stringify({ api_key: apiKey, connection_id: connectionId || owned.connection_id || null })); }
    catch { return NextResponse.json({ error: "Credential encryption is not configured. Set MASTER_ENCRYPTION_KEY and try again." }, { status: 503 }); }
    const [agent] = await db.select({ id: agents.id }).from(agents).where(eq(agents.tenantId, context.tenantId)).limit(1);
    if (already) await db.update(phoneNumbers).set({ telnyxNumberId: owned.id, status: "active" }).where(eq(phoneNumbers.id, already.id));
    else {
      try {
        await db.insert(phoneNumbers).values({ tenantId: context.tenantId, agentId: agent?.id || null, e164: phoneNumber, telnyxNumberId: owned.id, status: "active" });
      } catch { return NextResponse.json({ error: "This number is already connected to a workspace." }, { status: 409 }); }
    }
    await db.insert(integrations).values({ tenantId: context.tenantId, kind: "telnyx-credentials", configCiphertext: credentialCiphertext, status: "connected" }).onConflictDoUpdate({ target: [integrations.tenantId, integrations.kind], set: { configCiphertext: credentialCiphertext, status: "connected" } });
    await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "number.connected_byo", target: phoneNumber, details: { provider: "telnyx", routed: Boolean(connectionId) } });
    return NextResponse.json({ ok: true, e164: phoneNumber, provider: "telnyx", voiceUrl: webhookUrl, warning: warning || undefined });
  }

  if (body?.action === "purchase") {
    if (body.confirmPurchase !== true) return NextResponse.json({ error: "Confirm the purchase before placing the order." }, { status: 400 });
    const phoneNumber = body.phoneNumber || "";
    if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) return NextResponse.json({ error: "Choose a valid number from a recent Telnyx search." }, { status: 400 });
    const [search] = await db.select().from(integrations).where(and(eq(integrations.tenantId, context.tenantId), eq(integrations.kind, "telnyx-number-search"))).limit(1);
    let searchData: { candidates?: TelnyxCandidate[]; searchedAt?: string } = {};
    try { if (search?.configCiphertext) searchData = JSON.parse(decryptProviderSecret(search.configCiphertext)) as typeof searchData; } catch { return NextResponse.json({ error: "Recent number search has expired. Search again before purchasing." }, { status: 409 }); }
    const searchedAt = Date.parse(searchData.searchedAt || "");
    if (!searchData.candidates?.some((candidate) => candidate.phoneNumber === phoneNumber) || !Number.isFinite(searchedAt) || Date.now() - searchedAt > 15 * 60_000) return NextResponse.json({ error: "This number was not in your recent search. Search again before purchasing." }, { status: 409 });
    const activeNumbers = await db.select({ id: phoneNumbers.id, status: phoneNumbers.status }).from(phoneNumbers).where(eq(phoneNumbers.tenantId, context.tenantId));
    if (activeNumbers.some((number) => number.status !== "failed") && activeNumbers.filter((number) => number.status !== "failed").length >= (planCaps[context.planId] || 1)) return NextResponse.json({ error: `Your ${context.planId} plan allows up to ${planCaps[context.planId] || 1} numbers. Change plans before adding another.` }, { status: 409 });
    const telnyxAccount = await getTelnyxCredentials(context.tenantId);
    const telnyxKey = telnyxAccount?.apiKey;
    const connectionId = telnyxAccount?.connectionId;
    if (!telnyxKey) return NextResponse.json({ error: "Connect a Telnyx key before placing an order." }, { status: 503 });
    if (!connectionId) return NextResponse.json({ error: "TELNYX_CONNECTION_ID is required before purchase so the number can be attached to a configured voice connection." }, { status: 503 });
    let agentId: string | null = null;
    const [agent] = await db.select({ id: agents.id }).from(agents).where(eq(agents.tenantId, context.tenantId)).limit(1);
    agentId = agent?.id || null;
    let pendingId: string;
    try {
      const [pending] = await db.insert(phoneNumbers).values({ tenantId: context.tenantId, agentId, e164: phoneNumber, status: "pending" }).returning({ id: phoneNumbers.id });
      pendingId = pending.id;
    } catch { return NextResponse.json({ error: "This number is already assigned or another purchase is in progress." }, { status: 409 }); }
    const telnyxResponse = await fetch("https://api.telnyx.com/v2/number_orders", { method: "POST", headers: { Authorization: `Bearer ${telnyxKey}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ phone_numbers: [{ phone_number: phoneNumber }], connection_id: connectionId, customer_reference: `agent-caller-${context.tenantSlug}` }), signal: AbortSignal.timeout(15_000), cache: "no-store" }).catch(() => null);
    if (!telnyxResponse?.ok) {
      await db.update(phoneNumbers).set({ status: "failed" }).where(and(eq(phoneNumbers.id, pendingId), eq(phoneNumbers.tenantId, context.tenantId)));
      return NextResponse.json({ error: telnyxResponse?.status === 401 || telnyxResponse?.status === 403 ? "Telnyx rejected this order. Check key permissions and regulatory requirements." : "Telnyx could not place this order. No number was marked active; check your Telnyx account." }, { status: 502 });
    }
    const order = await telnyxResponse.json() as TelnyxOrderResponse;
    const orderId = order.data?.id;
    if (!orderId) {
      await db.update(phoneNumbers).set({ status: "failed" }).where(and(eq(phoneNumbers.id, pendingId), eq(phoneNumbers.tenantId, context.tenantId)));
      return NextResponse.json({ error: "Telnyx accepted an incomplete order response. Check the Telnyx portal before retrying." }, { status: 502 });
    }
    const orderStatus = order.data?.status || "pending";
    const localStatus = orderStatus === "success" ? "active" : orderStatus === "failure" || orderStatus === "cancelled" ? "failed" : "pending";
    await db.update(phoneNumbers).set({ telnyxOrderId: orderId, telnyxNumberId: order.data?.phone_numbers?.[0]?.id || null, status: localStatus }).where(and(eq(phoneNumbers.id, pendingId), eq(phoneNumbers.tenantId, context.tenantId)));
    await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "phone_number.purchase_ordered", target: phoneNumber, details: { telnyxOrderId: orderId, status: localStatus } });
    return NextResponse.json({ ok: true, number: phoneNumber, status: localStatus, orderId, message: localStatus === "active" ? "Number is active." : "Number order placed. Telnyx may require regulatory information before activation." });
  }

  if (body?.action === "refresh") {
    const numberId = body.numberId || "";
    const [number] = await db.select().from(phoneNumbers).where(and(eq(phoneNumbers.id, numberId), eq(phoneNumbers.tenantId, context.tenantId))).limit(1);
    if (!number || !number.telnyxOrderId) return NextResponse.json({ error: "No Telnyx order is attached to this number." }, { status: 404 });
    const telnyxKey = await getTelnyxKey(context.tenantId);
    if (!telnyxKey) return NextResponse.json({ error: "Connect a Telnyx key before checking order status." }, { status: 503 });
    const response = await fetch(`https://api.telnyx.com/v2/number_orders/${encodeURIComponent(number.telnyxOrderId)}`, { headers: { Authorization: `Bearer ${telnyxKey}` }, signal: AbortSignal.timeout(10_000), cache: "no-store" }).catch(() => null);
    if (!response?.ok) return NextResponse.json({ error: "Could not refresh this Telnyx order. Try again from your number dashboard." }, { status: 502 });
    const payload = await response.json() as TelnyxOrderResponse;
    const status = payload.data?.status === "success" ? "active" : ["failure", "cancelled", "deleted"].includes(payload.data?.status || "") ? "failed" : "pending";
    await db.update(phoneNumbers).set({ status, telnyxNumberId: payload.data?.phone_numbers?.[0]?.id || number.telnyxNumberId }).where(and(eq(phoneNumbers.id, number.id), eq(phoneNumbers.tenantId, context.tenantId)));
    return NextResponse.json({ ok: true, number: { id: number.id, status } });
  }

  if (body?.action === "request") {
    const areaCode = (body.areaCode || "").replace(/\D/g, "").slice(0, 5);
    const country = (body.country || "US").toUpperCase().slice(0, 2);
    if (areaCode && !/^\d{3,5}$/.test(areaCode)) return NextResponse.json({ error: "Enter a 3–5 digit area code." }, { status: 400 });
    const requestDetails = JSON.stringify({ country, areaCode: areaCode || null, requestedAt: new Date().toISOString() });
    let configCiphertext: string;
    try { configCiphertext = encryptProviderSecret(requestDetails); } catch { return NextResponse.json({ error: "Number request storage is not configured." }, { status: 503 }); }
    await db.insert(integrations).values({ tenantId: context.tenantId, kind: "number-request", configCiphertext, status: "requested" }).onConflictDoUpdate({ target: [integrations.tenantId, integrations.kind], set: { configCiphertext, status: "requested" } });
    await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "phone_number.requested", target: areaCode || country });
    return NextResponse.json({ ok: true, status: "requested", message: "Number request saved. A Telnyx account must be connected before a paid number can be provisioned." });
  }

  if (body?.action === "forward") {
    const forwardFrom = (body.forwardFrom || "").trim().slice(0, 30);
    if (!/^[+()\d\s.-]{7,30}$/.test(forwardFrom)) return NextResponse.json({ error: "Enter a valid business number to forward from." }, { status: 400 });
    const [agent] = await db.select().from(agents).where(eq(agents.tenantId, context.tenantId)).limit(1);
    if (!agent) return NextResponse.json({ error: "Set up your agent before adding forwarding details." }, { status: 404 });
    const businessInfo = { ...(agent.businessInfo || {}), forwardFrom };
    await db.update(agents).set({ businessInfo, updatedAt: new Date() }).where(eq(agents.id, agent.id));
    await db.insert(auditLog).values({ tenantId: context.tenantId, userId: context.userId, action: "phone_forwarding.saved", target: "business-line" });
    return NextResponse.json({ ok: true, forwardFrom: `${forwardFrom.slice(0, -4).replace(/\d/g, "•")}${forwardFrom.slice(-4)}` });
  }
  return NextResponse.json({ error: "Choose a number search, purchase, request, or forwarding update." }, { status: 400 });
}
