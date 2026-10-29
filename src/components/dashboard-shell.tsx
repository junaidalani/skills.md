"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { demoDashboard } from "@/lib/demo-data";
import { providerCatalog, ProviderKind } from "@/lib/provider-catalog";

type Panel = "overview" | "agent" | "calls" | "leads" | "numbers" | "providers" | "services" | "integrations" | "billing" | "settings" | "audit";
type AgentData = {
  name: string; greeting: string; businessName: string; businessHours: string; services: string; tone: string; language: string; active: boolean;
  businessInfo?: Record<string, unknown>; voiceSettings?: Record<string, unknown>; transferRules?: Record<string, unknown>; afterHours?: Record<string, unknown>; serviceSettings?: Record<string, unknown>;
};
type CallRow = { id: string; name: string; phone: string; reason: string; duration: string; time: string; outcome: string; initials: string };
type CallDetail = { summary: string | null; fromE164: string | null; outcome?: string; recordingUrl: string | null; turns: Array<{ role: string; text: string; at?: string }> };
type LeadRow = { id: string; name: string; phone: string; reason: string; status: string; createdAt: string; email?: string | null; notes?: string | null };
type ProviderItem = { kind: string; label: string; description: string; provider: string; model: string; mode?: string; status: string; last4?: string; lastTestedAt?: string | null };
type DashboardData = {
  demo: boolean; tenantName: string; userName: string; planId: string; tenantStatus: string;
  stats: { callsToday: number; callsChange: number; minutesThisMonth: number; minutesIncluded: number; leadsCaptured: number; leadsChange: number; answerRate: number };
  weeklyCalls: number[]; calls: CallRow[]; leads: LeadRow[]; providerHealth: ProviderItem[]; numbers: Array<{ id: string; e164: string; status: string; label: string }>;
  agent: AgentData | null;
};
type WidgetData = { publicKey: string; allowedOrigins: string[]; active: boolean } | null;
type IntegrationItem = { kind: string; label: string; url: string; status: string };

const navItems: Array<{ id: Panel; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "▦" },
  { id: "agent", label: "Your agent", icon: "✳" },
  { id: "calls", label: "Calls", icon: "◔" },
  { id: "leads", label: "Leads", icon: "↗" },
  { id: "numbers", label: "Phone numbers", icon: "⌕" },
  { id: "providers", label: "Providers & keys", icon: "◈" },
  { id: "services", label: "Phone services", icon: "⌘" },
  { id: "integrations", label: "Connected tools", icon: "⚒" },
  { id: "billing", label: "Billing", icon: "$" },
  { id: "settings", label: "Settings", icon: "⚙" },
  { id: "audit", label: "Audit log", icon: "≋" },
];
const planData = [
  { id: "starter", name: "Starter", price: 99, minutes: 300, detail: "One line · essentials" },
  { id: "growth", name: "Growth", price: 199, minutes: 800, detail: "Busy teams · up to 3 numbers" },
  { id: "pro", name: "Pro", price: 399, minutes: 2000, detail: "Growing operations · up to 8 numbers" },
];
const serviceFeatures = [
  { id: "leadCapture", name: "Lead capture & email alerts", detail: "Capture contact details and the reason for the call." },
  { id: "transfer", name: "Live transfer to a person", detail: "Transfer by business hours or caller request; take a message if nobody answers." },
  { id: "voicemail", name: "Voicemail & message taking", detail: "Save a callback request when a transfer or after-hours call needs follow-up." },
  { id: "appointmentBooking", name: "Calendar appointment booking", detail: "Connect a calendar before allowing the agent to book a slot." },
  { id: "smsTextBack", name: "Missed-call text-back", detail: "Requires a connected SMS provider and US 10DLC registration where applicable." },
  { id: "callRecording", name: "Call recording & playback", detail: "Off by default. Configure disclosure and retention to meet local rules." },
  { id: "afterHours", name: "Business hours & holiday rules", detail: "Set a different greeting and message-taking behavior after hours." },
  { id: "spamFilter", name: "Spam and robocall filter", detail: "Use a blocklist and simple abuse checks before answering." },
  { id: "webhooks", name: "Webhooks & CRM push", detail: "Deliver lead events to a destination you control." },
];
const initialData = demoDashboard as unknown as DashboardData;
const providerLetters: Record<string, string> = { llm: "AI", stt: "ST", tts: "VO", telephony: "PH", email: "EM" };
const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);

function titleFor(panel: Panel) { return navItems.find((item) => item.id === panel)?.label || "Overview"; }
function minutePercent(used: number, included: number) { return included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0; }

export function DashboardShell() {
  const [panel, setPanel] = useState<Panel>("overview");
  const [data, setData] = useState<DashboardData>(initialData);
  const [providers, setProviders] = useState<ProviderItem[]>(initialData.providerHealth);
  const [widget, setWidget] = useState<WidgetData>(null);
  const [auditEntries, setAuditEntries] = useState<Array<{ id: string; action: string; target: string | null; user: string; createdAt: string }>>([]);
  const appOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<CallRow | null>(null);
  const [callDetail, setCallDetail] = useState<CallDetail | null>(null);
  const [callDetailBusy, setCallDetailBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState(false);
  const [modalKind, setModalKind] = useState<ProviderKind | null>(null);
  const [formProvider, setFormProvider] = useState("");
  const [formModel, setFormModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [providerBusy, setProviderBusy] = useState(false);
  const [agentDraft, setAgentDraft] = useState<AgentData>(initialData.agent as AgentData);
  const [emailTo, setEmailTo] = useState("");
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [integrationForms, setIntegrationForms] = useState<Record<string, { url: string; secret: string }>>({});
  const [agentBusy, setAgentBusy] = useState(false);
  const [leadBusyId, setLeadBusyId] = useState("");
  const [areaCode, setAreaCode] = useState("");
  const [forwardFrom, setForwardFrom] = useState("");
  const [twilioDraft, setTwilioDraft] = useState({ number: "", sid: "", token: "" });
  const [telnyxDraft, setTelnyxDraft] = useState({ number: "", apiKey: "" });
  const [voiceUrl, setVoiceUrl] = useState("");
  const [numberBusy, setNumberBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ phoneNumber: string; locality: string; region: string; monthlyCost: number | null; upfrontCost: number | null }>>([]);
  const [widgetOrigins, setWidgetOrigins] = useState("");
  const [widgetBusy, setWidgetBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const showToast = useCallback((message: string, error = false) => {
    setToast(message); setToastError(error);
    window.setTimeout(() => setToast(""), 4200);
  }, []);

  const refreshDashboard = useCallback(async () => {
    try {
      const [dashboardResponse, providersResponse, widgetResponse, auditResponse, integrationsResponse, numbersResponse] = await Promise.all([
        fetch("/api/dashboard", { cache: "no-store" }),
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/widget-keys", { cache: "no-store" }),
        fetch("/api/audit-log", { cache: "no-store" }),
        fetch("/api/integrations", { cache: "no-store" }),
        fetch("/api/numbers", { cache: "no-store" }),
      ]);
      if (dashboardResponse.ok) {
        const result = await dashboardResponse.json() as DashboardData;
        setData(result);
        if (result.agent) {
          setAgentDraft(result.agent);
          if (typeof result.agent.businessInfo?.forwardFrom === "string") setForwardFrom(result.agent.businessInfo.forwardFrom);
          setEmailTo(typeof result.agent.businessInfo?.emailTo === "string" ? result.agent.businessInfo.emailTo : "");
        }
      }
      if (integrationsResponse.ok) {
        const result = await integrationsResponse.json() as { integrations?: IntegrationItem[] };
        const list = result.integrations || [];
        setIntegrations(list);
        setIntegrationForms(Object.fromEntries(list.map((item) => [item.kind, { url: item.url, secret: "" }])));
      }
      if (providersResponse.ok) {
        const result = await providersResponse.json() as { providers?: ProviderItem[] };
        if (result.providers) setProviders(result.providers);
      }
      if (widgetResponse.ok) {
        const result = await widgetResponse.json() as { widget?: WidgetData };
        setWidget(result.widget || null);
        setWidgetOrigins(result.widget?.allowedOrigins?.join("\n") || "");
      }
      if (auditResponse.ok) {
        const result = await auditResponse.json() as { entries?: typeof auditEntries };
        setAuditEntries(result.entries || []);
      }
      if (numbersResponse.ok) {
        const result = await numbersResponse.json() as { voiceUrl?: string };
        setVoiceUrl(result.voiceUrl || "");
      }
    } catch {
      showToast("Couldn’t refresh the workspace. Showing the demo view.", true);
    } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { queueMicrotask(() => void refreshDashboard()); }, [refreshDashboard]);

  const greetingName = useMemo(() => data.userName.split(" ")[0] || "there", [data.userName]);
  const currentProvider = modalKind ? providers.find((item) => item.kind === modalKind) : undefined;
  const widgetSnippet = widget?.publicKey ? `<script src="${appOrigin}/widget.js" data-agent-caller-key="${widget.publicKey}" data-business="${data.tenantName.replaceAll("\"", "")}"></script>` : "";

  function openProvider(kind: ProviderKind) {
    const current = providers.find((item) => item.kind === kind);
    setFormProvider(current?.provider || providerCatalog[kind][0]);
    setFormModel(current?.model || "");
    setApiKey("");
    setModalKind(kind);
  }

  async function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalKind) return;
    if (data.demo) { setModalKind(null); showToast("Create your workspace to securely add provider keys."); return; }
    setProviderBusy(true);
    try {
      const response = await fetch("/api/providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: modalKind, provider: formProvider, model: formModel, apiKey }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) { showToast(result.error || "Could not save this key.", true); return; }
      setModalKind(null); setApiKey(""); showToast("Key encrypted and saved. It is never shown again."); await refreshDashboard();
    } catch { showToast("Could not reach the provider settings API.", true); }
    finally { setProviderBusy(false); }
  }

  async function testProvider(kind: string) {
    if (data.demo) { showToast("This is a sample workspace. Sign up to test a real provider key."); return; }
    const response = await fetch("/api/providers/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
    const result = await response.json() as { error?: string; message?: string };
    if (!response.ok) showToast(result.error || result.message || "Provider test failed.", true);
    else showToast(result.message || "Provider connection verified.");
    await refreshDashboard();
  }

  async function removeProvider(kind: string) {
    if (data.demo) { showToast("Sign up to manage provider settings."); return; }
    const response = await fetch(`/api/providers?kind=${encodeURIComponent(kind)}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    if (!response.ok) { showToast(result.error || "Could not remove key.", true); return; }
    showToast("Provider key removed. Platform defaults will be used when configured."); await refreshDashboard();
  }

  async function switchProviderToPlatform(kind: string) {
    if (data.demo) { showToast("Sign up to configure provider modes."); return; }
    const item = providers.find((entry) => entry.kind === kind);
    const response = await fetch("/api/providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, provider: item?.provider, model: item?.model, mode: "platform" }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) showToast(result.error || "Could not switch provider mode.", true);
    else { showToast("Switched to the platform-managed option."); await refreshDashboard(); }
  }

  async function saveAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (data.demo) { showToast("These sample settings are read-only. Create an account to save your agent."); return; }
    setAgentBusy(true);
    const payload = {
      name: agentDraft.name,
      greeting: agentDraft.greeting,
      language: agentDraft.language,
      active: agentDraft.active,
      businessInfo: { ...(agentDraft.businessInfo || {}), businessName: agentDraft.businessName, businessHours: agentDraft.businessHours, services: agentDraft.services, emailTo },
      voiceSettings: { ...(agentDraft.voiceSettings || {}), tone: agentDraft.tone },
      transferRules: agentDraft.transferRules || {}, afterHours: agentDraft.afterHours || {}, serviceSettings: agentDraft.serviceSettings || {},
    };
    try {
      const response = await fetch("/api/agent", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) showToast(result.error || "Could not save agent settings.", true);
      else { showToast("Agent settings saved."); await refreshDashboard(); }
    } catch { showToast("Could not reach agent settings.", true); }
    finally { setAgentBusy(false); }
  }

  function updateService(id: string, checked: boolean) {
    setAgentDraft((previous) => ({ ...previous, serviceSettings: { ...(previous.serviceSettings || {}), [id]: checked } }));
  }

  async function saveIntegration(kind: string) {
    if (data.demo) { showToast("Create a workspace to connect your calendar or spreadsheet."); return; }
    const form = integrationForms[kind] || { url: "", secret: "" };
    const response = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, url: form.url, secret: form.secret }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { showToast(result.error || "Could not connect this tool.", true); return; }
    showToast("Connected. The agent can use it on the next call."); await refreshDashboard();
  }

  async function connectTwilioNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (data.demo) { showToast("Create a workspace to connect a real number."); return; }
    setNumberBusy(true);
    try {
      const response = await fetch("/api/numbers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect", phoneNumber: twilioDraft.number, accountSid: twilioDraft.sid, authToken: twilioDraft.token }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) { showToast(result.error || "Could not connect this number.", true); return; }
      setTwilioDraft({ number: "", sid: "", token: "" });
      showToast("Number connected. Point its Twilio voice webhook at your agent and it will answer."); await refreshDashboard();
    } catch { showToast("Could not reach the numbers API.", true); }
    finally { setNumberBusy(false); }
  }

  async function connectTelnyxNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (data.demo) { showToast("Create a workspace to connect a real number."); return; }
    setNumberBusy(true);
    try {
      const response = await fetch("/api/numbers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect-telnyx", phoneNumber: telnyxDraft.number, apiKey: telnyxDraft.apiKey }) });
      const result = await response.json() as { error?: string; warning?: string };
      if (!response.ok) { showToast(result.error || "Could not connect this number.", true); return; }
      setTelnyxDraft({ number: "", apiKey: "" });
      showToast(result.warning || "Telnyx number connected. The agent will answer calls routed to it."); await refreshDashboard();
    } catch { showToast("Could not reach the numbers API.", true); }
    finally { setNumberBusy(false); }
  }

  async function removeIntegration(kind: string) {
    if (data.demo) { showToast("Sign up to manage integrations."); return; }
    const response = await fetch(`/api/integrations?kind=${encodeURIComponent(kind)}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    if (!response.ok) { showToast(result.error || "Could not disconnect this tool.", true); return; }
    showToast("Disconnected."); await refreshDashboard();
  }

  async function updateLead(lead: LeadRow, status: string) {
    if (data.demo) {
      setData((previous) => ({ ...previous, leads: previous.leads.map((row) => row.id === lead.id ? { ...row, status } : row) }));
      showToast("Sample lead status updated for this preview."); return;
    }
    setLeadBusyId(lead.id);
    try {
      const response = await fetch("/api/leads", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: lead.id, status }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) showToast(result.error || "Could not update the lead.", true);
      else { setData((previous) => ({ ...previous, leads: previous.leads.map((row) => row.id === lead.id ? { ...row, status } : row) })); showToast("Lead status updated."); }
    } catch { showToast("Could not update the lead.", true); }
    finally { setLeadBusyId(""); }
  }

  async function openCall(call: CallRow) {
    setSelectedCall(call);
    setCallDetail(null);
    setCallDetailBusy(true);
    try {
      const response = await fetch(`/api/calls/${encodeURIComponent(call.id)}`, { cache: "no-store" });
      const result = await response.json() as { error?: string; call?: CallDetail };
      if (!response.ok || !result.call) showToast(result.error || "Call details are not available.", true);
      else setCallDetail(result.call);
    } catch { showToast("Could not load call details.", true); }
    finally { setCallDetailBusy(false); }
  }

  async function searchNumbers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (data.demo) { showToast("Create a workspace and connect Telnyx to search live inventory."); return; }
    setSearchBusy(true);
    try {
      const response = await fetch(`/api/numbers?search=1&areaCode=${encodeURIComponent(areaCode)}`, { cache: "no-store" });
      const result = await response.json() as { error?: string; candidates?: typeof candidates };
      if (!response.ok) { showToast(result.error || "Could not search Telnyx inventory.", true); setCandidates([]); }
      else { setCandidates(result.candidates || []); if (!result.candidates?.length) showToast("No local numbers matched. Try another area code."); }
    } catch { showToast("Could not reach Telnyx inventory.", true); }
    finally { setSearchBusy(false); }
  }

  async function purchaseNumber(candidate: { phoneNumber: string; monthlyCost: number | null }) {
    const cost = candidate.monthlyCost ? ` The listed recurring cost is about $${candidate.monthlyCost.toFixed(2)}/month.` : " Check the Telnyx account for final pricing.";
    if (!window.confirm(`Place a paid Telnyx order for ${candidate.phoneNumber}?${cost} The number will be assigned to this workspace.`)) return;
    setNumberBusy(true);
    try {
      const response = await fetch("/api/numbers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "purchase", phoneNumber: candidate.phoneNumber, confirmPurchase: true }) });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) showToast(result.error || "Could not purchase this number.", true);
      else { showToast(result.message || "Number order placed."); setCandidates([]); await refreshDashboard(); }
    } catch { showToast("Could not place the Telnyx order.", true); }
    finally { setNumberBusy(false); }
  }

  async function refreshNumberStatus(numberId: string) {
    setNumberBusy(true);
    try {
      const response = await fetch("/api/numbers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh", numberId }) });
      const result = await response.json() as { error?: string; number?: { status: string } };
      if (!response.ok) showToast(result.error || "Could not refresh this order.", true);
      else { showToast(`Number order status: ${result.number?.status || "pending"}.`); await refreshDashboard(); }
    } catch { showToast("Could not refresh the Telnyx order.", true); }
    finally { setNumberBusy(false); }
  }

  async function requestNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (data.demo) { showToast("Create a workspace to request a phone number."); return; }
    setNumberBusy(true);
    try {
      const response = await fetch("/api/numbers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request", areaCode }) });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) showToast(result.error || "Number request failed.", true);
      else { showToast(result.message || "Request saved."); setAreaCode(""); }
    } catch { showToast("Could not save number request.", true); }
    finally { setNumberBusy(false); }
  }

  async function saveForwarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (data.demo) { showToast("Create a workspace to save forwarding instructions."); return; }
    setNumberBusy(true);
    try {
      const response = await fetch("/api/numbers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "forward", forwardFrom }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) showToast(result.error || "Could not save the forwarding number.", true);
      else { showToast("Forwarding number saved."); await refreshDashboard(); }
    } catch { showToast("Could not save the forwarding number.", true); }
    finally { setNumberBusy(false); }
  }

  async function saveWidget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (data.demo) { showToast("Create your workspace to create a real widget key."); return; }
    setWidgetBusy(true);
    const allowedOrigins = widgetOrigins.split(/[\n,]/).map((origin) => origin.trim()).filter(Boolean);
    try {
      const response = await fetch("/api/widget-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowedOrigins, rotate: !widget?.publicKey }) });
      const result = await response.json() as { error?: string; widget?: WidgetData };
      if (!response.ok) showToast(result.error || "Could not save widget settings.", true);
      else { setWidget(result.widget || null); showToast("Widget settings saved."); }
    } catch { showToast("Could not save widget settings.", true); }
    finally { setWidgetBusy(false); }
  }

  async function rotateWidget() {
    if (data.demo) { showToast("Create a workspace to rotate a widget key."); return; }
    setWidgetBusy(true);
    try {
      const allowedOrigins = widgetOrigins.split(/[\n,]/).map((origin) => origin.trim()).filter(Boolean);
      const response = await fetch("/api/widget-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowedOrigins, rotate: true }) });
      const result = await response.json() as { error?: string; widget?: WidgetData };
      if (!response.ok) showToast(result.error || "Could not rotate this key.", true);
      else { setWidget(result.widget || null); showToast("Widget key rotated. Update the script on your website."); }
    } catch { showToast("Could not rotate this key.", true); }
    finally { setWidgetBusy(false); }
  }

  async function copyWidget() {
    if (!widgetSnippet) { showToast("Create your widget key first.", true); return; }
    try { await navigator.clipboard.writeText(widgetSnippet); setCopied(true); window.setTimeout(() => setCopied(false), 1800); showToast("Widget snippet copied."); }
    catch { showToast("Clipboard access is unavailable. Select and copy the snippet manually.", true); }
  }

  async function startCheckout(planId: string) {
    if (data.demo) { showToast("Sign in to connect Stripe Checkout."); return; }
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
      const result = await response.json() as { url?: string; error?: string };
      if (result.url) window.location.assign(result.url);
      else showToast(result.error || "Checkout is not configured yet.", true);
    } catch { showToast("Could not start Stripe Checkout.", true); }
  }

  async function openBillingPortal() {
    if (data.demo) { showToast("Sign in to manage billing."); return; }
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const result = await response.json() as { url?: string; error?: string };
      if (result.url) window.location.assign(result.url);
      else showToast(result.error || "Billing portal is not configured.", true);
    } catch { showToast("Could not open Stripe billing.", true); }
  }

  async function logout() {
    if (data.demo) { window.location.assign("/login"); return; }
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  const percent = minutePercent(data.stats.minutesThisMonth, data.stats.minutesIncluded);

  return (
    <div className="dashboard-app">
      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <Link className="brand" href="/"><span className="brand__mark" aria-hidden="true"><span /><span /><span /></span><span>agent caller</span></Link>
          <button className="workspace-switcher" type="button" onClick={() => showToast("Workspace switcher is ready when you invite another team.")}><span className="workspace-avatar">{data.tenantName.slice(0, 2).toUpperCase()}</span><span><strong>{data.tenantName}</strong><small>{data.planId[0].toUpperCase() + data.planId.slice(1)} workspace</small></span><span className="workspace-switcher__chevron">⌄</span></button>
          <p className="nav-label">WORKSPACE</p>
          <nav className="dashboard-nav" aria-label="Workspace navigation">
            {navItems.map((item) => <button type="button" key={item.id} aria-current={panel === item.id ? "page" : undefined} onClick={() => setPanel(item.id)}><span className="dashboard-nav__icon" aria-hidden="true">{item.icon}</span><span className="nav-copy">{item.label}</span></button>)}
          </nav>
          <div className="nav-spacer" />
          <div className="sidebar-help"><strong>Need a hand?</strong><p>We’re here to help tune your first call flow.</p><Link href="/demo">Book a walkthrough ↗</Link></div>
          <div className="sidebar-user"><span className="sidebar-user__avatar">{data.userName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span><strong>{data.userName}</strong><small>{data.demo ? "Sample workspace" : "Workspace owner"}</small></span><button type="button" aria-label="Sign out" onClick={() => void logout()}>↗</button></div>
        </aside>

        <main className="dashboard-main">
          <header className="dashboard-topbar"><div className="breadcrumb"><span>Workspace</span><span> / </span><b>{titleFor(panel)}</b>{loading && <span> · loading</span>}</div><div className="topbar-actions"><label className="topbar-search"><span aria-hidden="true">⌕</span><input aria-label="Search dashboard" placeholder="Search your workspace" onKeyDown={(event) => { if (event.key === "Enter") showToast("Search calls and leads from their tabs."); }} /></label><button className="topbar-icon" type="button" aria-label="Notifications" onClick={() => showToast("You’re all caught up.")}>♧</button></div></header>
          <div className="dashboard-content">
            {data.demo && <div className="demo-banner"><span><b>DEMO WORKSPACE</b> · Sample data, no real calls or provider keys.</span><Link href="/signup">Create your private workspace →</Link></div>}
            {panel === "overview" && <>
              <div className="dashboard-page-title"><div><h1>Good morning, {greetingName}.</h1><p>Here’s what’s happening with your calls today.</p></div><button className="button button--dark" type="button" onClick={() => setPanel("agent")}>✳ <span>Edit your agent</span></button></div>
              <div className="dashboard-grid">
                <MetricCard label="Calls today" value={formatNumber(data.stats.callsToday)} foot={data.stats.callsChange ? `↑ ${data.stats.callsChange}% vs last week` : "New calls answered today"} icon="◔" />
                <MetricCard label="Minutes this month" value={formatNumber(data.stats.minutesThisMonth)} foot={`${data.stats.minutesIncluded} included in your plan`} icon="◷" />
                <MetricCard label="Leads captured" value={formatNumber(data.stats.leadsCaptured)} foot={data.stats.leadsChange ? `↑ ${data.stats.leadsChange} new this week` : "Ready for your follow-up"} icon="↗" />
                <MetricCard label="Answer rate" value={`${data.stats.answerRate}%`} foot="Calls answered by your agent" icon="✓" />
              </div>
              <div className="dash-two-col">
                <section className="dash-card"><div className="dash-card__head"><div><h2>Call activity</h2><p>Your inbound calls over the last 7 days</p></div><span className="chart-legend"><i /> Calls answered</span></div><div className="chart-area"><div className="bar-chart" aria-label="Calls answered in the past seven days">{data.weeklyCalls.map((value, index) => { const max = Math.max(1, ...data.weeklyCalls); const days = ["M", "T", "W", "T", "F", "S", "S"]; return <div className="bar-group" key={`${days[index]}-${index}`}><div className="bar-track"><div className="bar-fill" style={{ height: `${Math.max(value ? 8 : 2, value / max * 100)}%` }} /></div><span>{days[index]}</span></div>; })}</div></div></section>
                <section className="dash-card"><div className="dash-card__head"><div><h2>Provider health</h2><p>Your voice stack at a glance</p></div><button type="button" onClick={() => setPanel("providers")}>Manage ↗</button></div><div className="provider-list">{data.providerHealth.slice(0, 3).map((provider) => <ProviderHealthRow key={provider.kind} provider={provider} />)}</div></section>
              </div>
              <div className="dash-two-col">
                <section className="dash-card"><div className="dash-card__head"><div><h2>Recent calls</h2><p>Latest conversations with your agent</p></div><button type="button" onClick={() => setPanel("calls")}>View all ↗</button></div>{data.calls.length ? <CallTable calls={data.calls.slice(0, 4)} onSelect={openCall} /> : <EmptyState icon="◔" title="Your first call is one setup away" text="Add your provider keys, finish your greeting, then connect a phone number to start capturing calls." />}</section>
                <div><section className="dash-card usage-card"><div className="usage-card__head"><strong>Monthly minutes</strong><span>{data.planId[0].toUpperCase() + data.planId.slice(1)} plan</span></div><div className="usage-number">{formatNumber(data.stats.minutesThisMonth)}<small>/ {formatNumber(data.stats.minutesIncluded)} min</small></div><div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div><div className="usage-caption"><span>{percent}% used</span><span>Resets next billing cycle</span></div></section><section className="dash-card usage-card"><div className="usage-card__head"><strong>Agent status</strong><span className="status-pill"><i /> {data.agent?.active ? "Ready" : "Needs setup"}</span></div><p style={{ margin: "13px 0 0", color: "#70828a", fontSize: 9, lineHeight: 1.65 }}>{data.agent?.name || "Set up your call assistant"}</p><button className="text-link" style={{ marginTop: 8, border: 0, background: "transparent", padding: 0 }} type="button" onClick={() => setPanel("agent")}>Tune agent <span>→</span></button></section></div>
              </div>
            </>}

            {panel === "agent" && <>
              <PageTitle title="Your agent" subtitle="Shape the first response, business details, and safe handoffs." />
              {agentDraft && <form className="dashboard-panel" onSubmit={(event) => void saveAgent(event)}>
                <section className="panel-card"><div className="panel-card__title"><div><h2>Agent identity</h2><p>Use your business name and the language your callers expect.</p></div><span className="status-pill"><i /> {agentDraft.active ? "Active" : "Paused"}</span></div>
                  <div className="form-grid"><Field label="Agent name"><input value={agentDraft.name} onChange={(event) => setAgentDraft({ ...agentDraft, name: event.target.value })} maxLength={120} /></Field><Field label="Business name"><input value={agentDraft.businessName} onChange={(event) => setAgentDraft({ ...agentDraft, businessName: event.target.value })} maxLength={120} /></Field><Field label="Business hours"><input value={agentDraft.businessHours} onChange={(event) => setAgentDraft({ ...agentDraft, businessHours: event.target.value })} placeholder="Mon–Fri, 8am–5pm" /></Field><Field label="Language"><select value={agentDraft.language} onChange={(event) => setAgentDraft({ ...agentDraft, language: event.target.value })}><option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="es-US">Spanish (US)</option><option value="fr-CA">French (Canada)</option></select></Field><Field label="Services offered"><textarea value={agentDraft.services} onChange={(event) => setAgentDraft({ ...agentDraft, services: event.target.value })} maxLength={1200} placeholder="List what your team can help with" /></Field><Field label="Send call summaries to (email)"><input type="email" value={emailTo} onChange={(event) => setEmailTo(event.target.value)} placeholder="owner@yourbusiness.com" maxLength={254} /></Field><Field label="Voice style"><select value={agentDraft.tone} onChange={(event) => setAgentDraft({ ...agentDraft, tone: event.target.value })}><option>Warm and professional</option><option>Friendly and concise</option><option>Calm and reassuring</option><option>Direct and practical</option></select></Field></div>
                </section>
                <section className="panel-card"><div className="panel-card__title"><div><h2>Greeting & call guidance</h2><p>Disclose that it’s an AI. Keep caller safety and privacy in mind.</p></div></div><Field label="Opening greeting"><textarea value={agentDraft.greeting} onChange={(event) => setAgentDraft({ ...agentDraft, greeting: event.target.value })} minLength={1} maxLength={1200} required /></Field><small className="field-hint">Include a clear AI disclosure and, where needed, a recording notice. Never ask for payment card numbers.</small></section>
                <section className="panel-card"><div className="panel-card__title"><div><h2>Phone-service options</h2><p>Turn on the settings you plan to configure. Some require provider keys or local compliance steps.</p></div></div>{serviceFeatures.slice(0, 6).map((feature) => <ToggleRow key={feature.id} name={feature.name} detail={feature.detail} checked={Boolean(agentDraft.serviceSettings?.[feature.id])} onChange={(checked) => updateService(feature.id, checked)} />)}</section>
                <div className="panel-actions"><button className="button button--dark" disabled={agentBusy}>{agentBusy ? "Saving…" : "Save agent settings"}<span>→</span></button></div>
              </form>}
            </>}

            {panel === "calls" && <><PageTitle title="Calls" subtitle="Review conversations, outcomes, and call duration." action={<button className="button button--outline" type="button" onClick={() => showToast(data.demo ? "Create an account to export real call history." : "CSV export is available after call events are connected.")}>Export calls ↓</button>} /><section className="dash-card">{data.calls.length ? <CallTable calls={data.calls} onSelect={openCall} /> : <EmptyState icon="◔" title="No calls yet" text="Once a phone number is connected, every inbound call will appear here with its outcome and duration." />}</section><div className="provider-security-note"><b>i</b><p>Call recordings are off by default. If you enable them, add the required disclosure and configure retention for the locations you serve.</p></div></>}

            {panel === "leads" && <><PageTitle title="Leads" subtitle="Every useful caller detail, ready for your team’s next step." action={<button className="button button--outline" type="button" onClick={() => showToast(data.demo ? "Create an account to export your private leads." : "CSV export is coming with your connected call pipeline.")}>Export leads ↓</button>} />{data.leads.length ? <section className="dash-card"><div className="dash-card__head"><div><h2>Lead inbox</h2><p>Update the status as your team follows up.</p></div><span className="outcome-pill">{data.leads.filter((lead) => lead.status === "new").length} new</span></div><div className="table-scroll"><table className="call-table"><thead><tr><th>Caller</th><th>Reason</th><th>Received</th><th>Status</th></tr></thead><tbody>{data.leads.map((lead) => <tr key={lead.id}><td><div className="call-person"><span className="call-person__avatar">{lead.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span><strong>{lead.name}</strong><small>{lead.phone}</small></span></div></td><td>{lead.reason}</td><td>{lead.createdAt}</td><td><select className="lead-status" aria-label={`Update ${lead.name} status`} value={lead.status} disabled={leadBusyId === lead.id} onChange={(event) => void updateLead(lead, event.target.value)}><option value="new">New</option><option value="contacted">Contacted</option><option value="won">Won</option><option value="lost">Lost</option></select></td></tr>)}</tbody></table></div></section> : <section className="dash-card"><EmptyState icon="↗" title="No leads yet" text="New caller details will land here automatically when your agent starts answering calls." /></section>}</>}

            {panel === "numbers" && <><PageTitle title="Phone numbers" subtitle="Connect a new line or add instructions for forwarding your business number." />
              <section className="panel-card"><div className="panel-card__title"><div><h2>Your numbers</h2><p>Numbers assigned to this workspace. A pending Telnyx order is not ready to receive calls.</p></div><span className="outcome-pill">{data.numbers.length} {data.numbers.length === 1 ? "number" : "numbers"}</span></div>{data.numbers.length ? data.numbers.map((number) => <div className="number-card" key={number.id}><div className="number-card__left"><span className="number-card__icon">⌕</span><span><strong>{number.e164}</strong><small>{number.label} · {number.status}</small></span></div><div className="number-card__right"><span className="status-pill"><i /> {number.status}</span>{number.status !== "active" && number.id.startsWith("demo-") === false && <button className="button button--outline" type="button" disabled={numberBusy} onClick={() => void refreshNumberStatus(number.id)}>Refresh order</button>}</div></div>) : <EmptyState icon="⌕" title="No number connected yet" text="Search Telnyx inventory or add forwarding details for your existing line." />}</section>
              <section className="panel-card"><div className="panel-card__title"><div><h2>Search local Telnyx inventory</h2><p>Search is free and read-only. A number is purchased only after you explicitly confirm an order.</p></div><span className="outcome-pill">US local · voice</span></div><form className="number-form" onSubmit={(event) => void searchNumbers(event)}><Field label="Country"><select defaultValue="US" disabled><option value="US">United States</option></select></Field><Field label="Preferred area code (optional)"><input inputMode="numeric" value={areaCode} onChange={(event) => setAreaCode(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="415" /></Field><button className="button button--dark" disabled={searchBusy}>{searchBusy ? "Searching…" : "Search numbers"}<span>⌕</span></button></form>{candidates.length > 0 && <div className="candidate-list">{candidates.map((candidate) => <div className="number-card" key={candidate.phoneNumber}><div className="number-card__left"><span className="number-card__icon">⌕</span><span><strong>{candidate.phoneNumber}</strong><small>{candidate.locality} · {candidate.region}</small></span></div><div className="number-card__right"><span className="candidate-cost">{candidate.monthlyCost ? `$${candidate.monthlyCost.toFixed(2)} / mo` : "See Telnyx pricing"}{candidate.upfrontCost ? ` · $${candidate.upfrontCost.toFixed(2)} setup` : ""}</span><button className="button button--outline" type="button" disabled={numberBusy} onClick={() => void purchaseNumber(candidate)}>Buy number</button></div></div>)}</div>}<div className="provider-security-note" style={{ marginTop: 14 }}><b>i</b><p>Purchases are billed by Telnyx. Live ordering requires a connected Telnyx key, current inventory from a search, and space under your plan’s number cap. Review any regulatory requirements in Telnyx.</p></div></section>
              <section className="panel-card"><div className="panel-card__title"><div><h2>Connect a Twilio number you already own</h2><p>We check the number against your Twilio account, then answer calls routed to it.</p></div><span className="outcome-pill">Bring your own</span></div>
                <form className="number-form" onSubmit={(event) => void connectTwilioNumber(event)}>
                  <Field label="Phone number"><input value={twilioDraft.number} onChange={(event) => setTwilioDraft({ ...twilioDraft, number: event.target.value })} placeholder="+1 415 555 0138" /></Field>
                  <Field label="Twilio Account SID"><input value={twilioDraft.sid} onChange={(event) => setTwilioDraft({ ...twilioDraft, sid: event.target.value })} placeholder="AC00000000000000000000000000000000" autoComplete="off" /></Field>
                  <Field label="Twilio Auth Token"><input type="password" value={twilioDraft.token} onChange={(event) => setTwilioDraft({ ...twilioDraft, token: event.target.value })} autoComplete="off" /></Field>
                  <button className="button button--dark" disabled={numberBusy}>{numberBusy ? "Checking…" : "Connect number"}<span>→</span></button>
                </form>
                <div className="provider-security-note" style={{ marginTop: 14 }}><b>i</b><p>In the Twilio console set the number&apos;s voice webhook (HTTP POST) to <code>{voiceUrl ? `${voiceUrl}/twilio/voice` : "your voice server URL + /twilio/voice"}</code>. Credentials are encrypted, never shown again, and used only to answer your calls.</p></div>
              </section>
              <section className="panel-card"><div className="panel-card__title"><div><h2>Connect a Telnyx number you already own</h2><p>We check the number on your Telnyx account, then route its calls to your agent.</p></div><span className="outcome-pill">Bring your own</span></div>
                <form className="number-form" onSubmit={(event) => void connectTelnyxNumber(event)}>
                  <Field label="Phone number"><input value={telnyxDraft.number} onChange={(event) => setTelnyxDraft({ ...telnyxDraft, number: event.target.value })} placeholder="+1 551 900 7793" /></Field>
                  <Field label="Telnyx API key"><input type="password" value={telnyxDraft.apiKey} onChange={(event) => setTelnyxDraft({ ...telnyxDraft, apiKey: event.target.value })} autoComplete="off" placeholder="KEY…" /></Field>
                  <button className="button button--dark" disabled={numberBusy}>{numberBusy ? "Checking…" : "Connect number"}<span>→</span></button>
                </form>
                <div className="provider-security-note" style={{ marginTop: 14 }}><b>i</b><p>Create the key in Telnyx → API Keys. We verify the number, create a Call Control application for this workspace, and route the number to <code>{voiceUrl ? `${voiceUrl}/telnyx/webhook` : "your voice server URL + /telnyx/webhook"}</code>. The key is encrypted and never shown again.</p></div>
              </section>
              <section className="panel-card"><div className="panel-card__title"><div><h2>Need help provisioning?</h2><p>Save a non-purchasing request for an administrator to review.</p></div></div><form className="number-form" onSubmit={(event) => void requestNumber(event)}><Field label="Preferred area code (optional)"><input inputMode="numeric" value={areaCode} onChange={(event) => setAreaCode(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="415" /></Field><div className="field-hint">This request does not buy a number or create a Telnyx charge.</div><button className="button button--outline" disabled={numberBusy}>{numberBusy ? "Saving…" : "Save request only"}</button></form></section>
              <section className="panel-card"><div className="panel-card__title"><div><h2>Forward your existing business line</h2><p>Save a callback reference while your team arranges carrier forwarding.</p></div></div><form className="number-form" onSubmit={(event) => void saveForwarding(event)}><Field label="Your existing phone number"><input value={forwardFrom} onChange={(event) => setForwardFrom(event.target.value)} placeholder="+1 (415) 555-0138" /></Field><div className="field-hint">Ask your carrier about forwarding this line to your Agent Caller number.</div><button className="button button--outline" disabled={numberBusy}>Save forwarding details</button></form></section>
            </>}

            {panel === "providers" && <><PageTitle title="Providers & keys" subtitle="Choose platform-managed services or bring your own provider key." action={<span className="outcome-pill">AES-256-GCM encrypted</span>} /><div className="provider-security-note"><b>⌑</b><p><strong>Keys are write-only.</strong> They’re encrypted before storage, never returned by the API, shown only as the last four characters, and visible to you only as a masked hint. Platform admins cannot read your key.</p></div><div className="provider-grid">{providers.map((provider) => <ProviderCard key={provider.kind} provider={provider} onAdd={() => openProvider(provider.kind as ProviderKind)} onTest={() => void testProvider(provider.kind)} onRemove={() => void removeProvider(provider.kind)} onPlatform={() => void switchProviderToPlatform(provider.kind)} />)}</div><section className="panel-card"><div className="panel-card__title"><div><h2>Provider boundaries</h2><p>Production keys belong in the server environment or your encrypted workspace vault.</p></div></div><div className="provider-security-note"><b>!</b><p>Usage and external provider billing depend on your selected stack. Add a monthly spend cap with your provider, and confirm voice-model commercial terms before reselling calls.</p></div></section></>}

            {panel === "integrations" && <>
              <PageTitle title="Connected tools" subtitle="Let the agent book appointments, save rows in a sheet, or push call details to your own system." />
              <section className="panel-card"><div className="panel-card__title"><div><h2>How this works</h2><p>Each tool is a https web app (Google Apps Script or any endpoint) that receives call details and answers with a message the agent speaks back.</p></div></div>
                <div className="provider-security-note"><b>i</b><p>Deploy <code>scripts/google_actions.gs</code> in Apps Script as a web app (execute as you, access: anyone with the link), then paste its <code>/exec</code> URL here. The shared secret must match the script&apos;s <code>SCRIPT_SECRET</code>.</p></div>
              </section>
              {integrations.map((item) => {
                const form = integrationForms[item.kind] || { url: "", secret: "" };
                const connected = item.status === "connected";
                return <section className="panel-card" key={item.kind}>
                  <div className="panel-card__title"><div><h2>{item.label}</h2><p>{connected ? "Connected — the agent can use this on calls." : "Paste the web app URL to turn this on."}</p></div><span className="outcome-pill">{connected ? "Connected" : "Not connected"}</span></div>
                  <div className="form-grid">
                    <Field label="Web app URL"><input type="url" value={form.url} onChange={(event) => setIntegrationForms({ ...integrationForms, [item.kind]: { ...form, url: event.target.value } })} placeholder="https://script.google.com/macros/s/…/exec" /></Field>
                    <Field label="Shared secret (optional)"><input value={form.secret} autoComplete="off" onChange={(event) => setIntegrationForms({ ...integrationForms, [item.kind]: { ...form, secret: event.target.value } })} placeholder="Matches SCRIPT_SECRET in your script" /></Field>
                  </div>
                  <div className="panel-actions"><button className="button button--dark" type="button" onClick={() => void saveIntegration(item.kind)}>{connected ? "Update" : "Connect"}<span>→</span></button>{connected && <button className="button button--outline" type="button" onClick={() => void removeIntegration(item.kind)}>Disconnect</button>}</div>
                </section>;
              })}
            </>}

            {panel === "services" && <><PageTitle title="Phone services" subtitle="Choose your next add-ons. Most require a configured provider and operational review." /><section className="panel-card"><div className="panel-card__title"><div><h2>Available call services</h2><p>Settings are per-agent. Enable a feature only after its provider, disclosure, and fallback are ready.</p></div></div>{serviceFeatures.map((feature) => <ToggleRow key={feature.id} name={feature.name} detail={feature.detail} checked={Boolean(agentDraft.serviceSettings?.[feature.id])} onChange={(checked) => updateService(feature.id, checked)} />)}<div className="panel-actions"><button className="button button--dark" type="button" onClick={() => { if (data.demo) showToast("Create a workspace to save phone-service settings."); else void saveServiceSettings(); }}>Save phone services <span>→</span></button></div></section><section className="panel-card"><div className="panel-card__title"><div><h2>Safe defaults</h2><p>Outbound sales calling, card collection, and medical data handling are intentionally out of scope.</p></div></div><div className="provider-security-note"><b>✓</b><p>Keep outbound calling disabled unless a caller has explicitly requested a callback. Never collect payment-card numbers. Review recording consent and texting registration for each region.</p></div></section></>}

            {panel === "billing" && <><PageTitle title="Billing & usage" subtitle="Simple monthly allowances, visible usage, no unlimited-minute surprises." action={<span className="outcome-pill">{data.tenantStatus === "trial" ? "14-day trial" : data.tenantStatus}</span>} /><section className="panel-card"><div className="panel-card__title"><div><h2>Current usage</h2><p>Minutes are rounded up to the next minute in this dashboard preview.</p></div></div><div className="usage-number">{formatNumber(data.stats.minutesThisMonth)}<small>/ {formatNumber(data.stats.minutesIncluded)} minutes</small></div><div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div><div className="usage-caption"><span>{percent}% used</span><span>Overage: $0.20 / minute</span></div></section><section className="panel-card"><div className="panel-card__title"><div><h2>Choose your plan</h2><p>Stripe Checkout opens when the account is configured.</p></div></div><div className="plan-grid">{planData.map((plan) => <div className={`plan-option${data.planId === plan.id ? " plan-option--active" : ""}`} key={plan.id}><strong>{plan.name}{data.planId === plan.id ? " · Current" : ""}</strong><div className="plan-option__price">${plan.price}<small>/ mo</small></div><p>{formatNumber(plan.minutes)} minutes · {plan.detail}</p><button className={data.planId === plan.id && data.tenantStatus !== "trial" ? "button button--outline" : "button button--dark"} type="button" onClick={() => void (data.planId === plan.id && data.tenantStatus !== "trial" ? openBillingPortal() : startCheckout(plan.id))}>{data.planId === plan.id ? data.tenantStatus === "trial" ? "Continue to checkout" : "Manage plan" : "Choose plan"}<span>→</span></button></div>)}</div></section><div className="billing-note">Plan costs are illustrative and exclude hosting, telephony, and provider usage. Never promise unlimited minutes. Stripe billing activates after `STRIPE_SECRET_KEY` and each `STRIPE_PRICE_*` value are configured.</div></>}

            {panel === "audit" && <><PageTitle title="Audit log" subtitle="Recent workspace changes, scoped to this tenant." /><section className="dash-card"><div className="dash-card__head"><div><h2>Activity history</h2><p>Provider values and secrets are never included in this feed.</p></div><span className="outcome-pill">{auditEntries.length} entries</span></div>{auditEntries.length ? <div className="table-scroll"><table className="call-table"><thead><tr><th>Action</th><th>Target</th><th>Changed by</th><th>When</th></tr></thead><tbody>{auditEntries.map((entry) => <tr key={entry.id}><td><strong>{entry.action.replaceAll("_", " ").replaceAll(".", " · ")}</strong></td><td>{entry.target || "Workspace"}</td><td>{entry.user}</td><td>{entry.createdAt}</td></tr>)}</tbody></table></div> : <EmptyState icon="≋" title="No changes recorded yet" text="Provider key, agent, lead, widget, and phone settings changes will appear here." />}</section></>}

            {panel === "settings" && <><PageTitle title="Workspace settings" subtitle="Manage the site widget, your account, and data boundaries." />
              <section className="panel-card"><div className="panel-card__title"><div><h2>Call button widget</h2><p>Create a public key for a website embed and restrict where it can be used.</p></div>{widget?.active && <span className="status-pill"><i /> Active</span>}</div><form onSubmit={(event) => void saveWidget(event)}><Field label="Allowed website origins" hint="Enter one origin per line, for example https://yourbusiness.com. Avoid wildcards."><textarea value={widgetOrigins} onChange={(event) => setWidgetOrigins(event.target.value)} placeholder="https://yourbusiness.com\nhttps://www.yourbusiness.com" /></Field><div className="panel-actions" style={{ marginTop: 12 }}><button className="button button--dark" disabled={widgetBusy}>{widgetBusy ? "Saving…" : widget?.publicKey ? "Save widget settings" : "Create widget key"}<span>→</span></button>{widget?.publicKey && <button className="button button--outline" type="button" onClick={() => void rotateWidget()} disabled={widgetBusy}>Rotate key</button>}</div></form>{widget?.publicKey && <div style={{ marginTop: 17 }}><div className="field"><label htmlFor="widget-snippet">Website script snippet</label><div className="copy-box"><code id="widget-snippet">{widgetSnippet}</code><button type="button" onClick={() => void copyWidget()}>{copied ? "Copied" : "Copy"}</button></div></div><p className="field-hint">The public key is safe to place in your site source. Secret provider keys are never included in this snippet.</p></div>}</section>
              <section className="panel-card"><div className="panel-card__title"><div><h2>Account</h2><p>Workspace owner and session actions.</p></div></div><div className="number-card"><div className="number-card__left"><span className="number-card__icon">◎</span><span><strong>{data.userName}</strong><small>{data.demo ? "Demo account · sign up to create a private workspace" : "Owner · signed-in session"}</small></span></div><button className="button button--outline" type="button" onClick={() => void logout()}>{data.demo ? "Sign in" : "Sign out"}</button></div></section>
              <section className="panel-card"><div className="panel-card__title"><div><h2>Privacy & safety</h2><p>Keep the agent in a safe, inbound-first lane.</p></div></div><div className="provider-security-note"><b>✓</b><p>AI disclosure belongs in the greeting. Recording is optional and should match your local consent rules. Avoid medical records and payment-card details. Provider keys are encrypted at rest and masked in this workspace.</p></div><div className="feature-list" style={{ marginTop: 12 }}><Link href="/legal/ai-disclosure">AI and call-recording disclosure →</Link><Link href="/legal/privacy">Privacy policy →</Link><Link href="/security">Security overview →</Link></div></section>
            </>}
          </div>
        </main>
      </div>
      {selectedCall && <div className="provider-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCall(null); }}><section className="call-detail-modal" role="dialog" aria-modal="true" aria-labelledby="call-detail-title"><div className="call-detail-modal__head"><div><span className="eyebrow">CALL DETAILS · {selectedCall.duration}</span><h2 id="call-detail-title">{selectedCall.name}</h2><p>{selectedCall.phone} · {selectedCall.time} · {selectedCall.outcome}</p></div><button type="button" aria-label="Close call details" onClick={() => setSelectedCall(null)}>×</button></div>{callDetailBusy && <div className="empty-state"><p>Loading call details…</p></div>}{callDetail && <><div className="call-summary"><span>AI SUMMARY</span><p>{callDetail.summary || "No summary was saved for this call."}</p></div>{callDetail.recordingUrl && <audio className="call-audio" controls src={callDetail.recordingUrl}>Your browser does not support call audio.</audio>}<div className="transcript-list"><div className="transcript-list__head"><strong>Transcript</strong><span>{callDetail.turns.length ? `${callDetail.turns.length} turns` : "No transcript"}</span></div>{callDetail.turns.length ? callDetail.turns.map((turn, index) => <article className={`transcript-turn${turn.role === "assistant" ? " transcript-turn--agent" : ""}`} key={`${index}-${turn.role}`}><span>{turn.role === "assistant" ? "CALLSTEAD ASSISTANT" : turn.role.toUpperCase()}</span><p>{turn.text}</p></article>) : <div className="empty-state"><p>There are no transcript turns for this call.</p></div>}</div></>}</section></div>}
      {modalKind && <div className="provider-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalKind(null); }}><section className="provider-modal" role="dialog" aria-modal="true" aria-labelledby="provider-modal-title"><div className="provider-modal__head"><div><h2 id="provider-modal-title">{currentProvider?.last4 ? "Replace provider key" : "Add provider key"}</h2><p>{currentProvider?.label} · encrypted before it reaches the database</p></div><button type="button" aria-label="Close dialog" onClick={() => setModalKind(null)}>×</button></div><form onSubmit={(event) => void saveProvider(event)}><Field label="Provider"><select value={formProvider} onChange={(event) => setFormProvider(event.target.value)}>{modalKind && (providerCatalog[modalKind] as readonly string[]).map((option) => <option key={option}>{option}</option>)}</select></Field><Field label="Model (optional)"><input value={formModel} onChange={(event) => setFormModel(event.target.value)} placeholder="e.g. a fast production model" maxLength={120} /></Field><Field label="API key"><input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste the key once; it won’t be shown again" required minLength={8} maxLength={500} /></Field><p className="field-hint">The raw key is sent over HTTPS, encrypted at rest with AES-256-GCM, and never returned by this application.</p><div className="provider-modal__buttons"><button type="button" onClick={() => setModalKind(null)}>Cancel</button><button type="submit" disabled={providerBusy}>{providerBusy ? "Encrypting…" : "Encrypt & save key"}</button></div></form></section></div>}
      {toast && <div className={`toast${toastError ? " toast--error" : ""}`} role="status">{toast}</div>}
    </div>
  );

  async function saveServiceSettings() {
    setAgentBusy(true);
    try {
      const response = await fetch("/api/agent", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceSettings: agentDraft.serviceSettings || {} }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) showToast(result.error || "Could not save phone services.", true);
      else { showToast("Phone-service preferences saved."); await refreshDashboard(); }
    } catch { showToast("Could not save phone services.", true); }
    finally { setAgentBusy(false); }
  }
}

function MetricCard({ label, value, foot, icon }: { label: string; value: string; foot: string; icon: string }) {
  return <article className="dash-card metric-card"><div className="metric-card__top"><span>{label}</span><span className="metric-card__icon">{icon}</span></div><p className="metric-card__value">{value}</p><div className="metric-card__foot"><b>↗</b>{foot}</div></article>;
}
function PageTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="dashboard-page-title"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}{hint && <small className="field-hint">{hint}</small>}</div>;
}
function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="empty-state"><span className="empty-state__icon">{icon}</span><h3>{title}</h3><p>{text}</p></div>;
}
function ProviderHealthRow({ provider }: { provider: ProviderItem }) {
  return <div className="provider-health-row"><span className="provider-glyph">{providerLetters[provider.kind] || "AI"}</span><span><strong>{provider.label}</strong><small>{provider.provider} · {provider.model}</small></span><span className="provider-health-row__status"><i />{provider.status}</span></div>;
}
function CallTable({ calls, onSelect }: { calls: CallRow[]; onSelect?: (call: CallRow) => void }) {
  return <div className="table-scroll"><table className="call-table"><thead><tr><th>Caller</th><th>Reason</th><th>Duration</th><th>Outcome</th></tr></thead><tbody>{calls.map((call) => <tr key={call.id}><td><button className="call-person__button" type="button" onClick={() => onSelect?.(call)}><span className="call-person"><span className="call-person__avatar">{call.initials}</span><span><strong>{call.name}</strong><small>{call.phone} · {call.time}</small></span></span></button></td><td>{call.reason}</td><td>{call.duration}</td><td><span className={`outcome-pill${call.outcome.toLowerCase().includes("callback") ? " outcome-pill--neutral" : ""}`}>{call.outcome}</span></td></tr>)}</tbody></table></div>;
}
function ToggleRow({ name, detail, checked, onChange }: { name: string; detail: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="toggle-row"><div className="toggle-copy"><strong>{name}</strong><small>{detail}</small></div><button className="switch" type="button" role="switch" aria-checked={checked} aria-label={name} onClick={() => onChange(!checked)} /></div>;
}
function ProviderCard({ provider, onAdd, onTest, onRemove, onPlatform }: { provider: ProviderItem; onAdd: () => void; onTest: () => void; onRemove: () => void; onPlatform: () => void }) {
  const configured = Boolean(provider.last4);
  const statusClass = provider.status.toLowerCase().includes("not") || provider.status.toLowerCase().includes("demo") || provider.status.toLowerCase().includes("test") ? " provider-card__status--pending" : "";
  return <article className="provider-card"><div className="provider-card__top"><span className="provider-glyph">{providerLetters[provider.kind] || "AI"}</span><div><strong>{provider.label}</strong><p>{provider.description}</p></div><span className={`provider-card__status${statusClass}`}>{provider.status}</span></div><div className="provider-card__detail"><span>{provider.provider} · {provider.model}</span><b>{configured ? provider.last4 : provider.mode === "platform" ? "Platform-managed" : "No key set"}</b></div><div className="provider-card__actions"><button type="button" onClick={onAdd}>{configured ? "Replace key" : "Add key"}</button><button type="button" onClick={onTest}>Test</button>{configured && <button type="button" onClick={onRemove}>Remove</button>}<button type="button" onClick={onPlatform}>Platform key</button></div></article>;
}
