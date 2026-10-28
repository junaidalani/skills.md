import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Security", description: "Security and data boundaries for the Agent Caller voice-agent workspace." };
const controls = [
  ["Tenant-scoped records", "Workspace queries filter records by the signed-in tenant. Member roles are checked before sensitive settings change."],
  ["Encrypted provider keys", "Bring-your-own provider keys are encrypted with AES-256-GCM before storage. The API returns only a last-four-character mask, never the stored ciphertext or raw key."],
  ["Signed account sessions", "Passwords use a scrypt hash. Sessions are signed and set in an httpOnly, SameSite cookie, with Secure enabled in production."],
  ["Public widget allowlists", "Widget configuration is served only when a public widget key is active and the browser origin matches an explicit allowlist."],
  ["Audit trail", "Provider, agent, lead, widget, and number-setting changes create tenant-scoped audit entries without storing raw API keys."],
  ["Voice process boundary", "The existing always-on WebSocket voice service is a separate deployment. This repository includes a signed call-ended ingestion contract; do not route live media through a serverless function."],
];

export default function SecurityPage() {
  return <><SiteHeader /><main><section className="page-hero"><div className="shell page-hero__inner"><span className="eyebrow">Security by design</span><h1>Keep keys masked.<br /><em>Keep data in its lane.</em></h1><p>Agent Caller is designed around tenant-scoped workspaces and minimum necessary data. Review these controls before connecting a live number or provider.</p></div></section><section className="content-section shell"><div className="steps-grid">{controls.map(([title, copy], index) => <article className="step-card" key={title}><span className="step-card__num">CONTROL 0{index + 1}</span><h2>{title}</h2><p>{copy}</p></article>)}</div></section><section className="content-section" style={{ background: "#eaf1f2" }}><div className="shell content-narrow"><span className="eyebrow">Deployment checklist</span><h2>Before you connect real customers.</h2><ul><li>Set a unique `SESSION_SECRET`, `MASTER_ENCRYPTION_KEY`, and voice-webhook secret in a secrets manager.</li><li>Use HTTPS, a managed Postgres database, encrypted backups, and a tested restore procedure.</li><li>Confirm provider commercial terms, recording consent, SMS registration, and regional privacy requirements.</li><li>Keep voice streaming on an always-on server; do not use serverless functions for long-lived media WebSockets.</li><li>Do not use this service for payment cards, medical records, or unapproved outbound sales calls.</li></ul><p>The public demo is sample data. This code is a foundation, not a certification or legal opinion. Have your deployment reviewed before processing real caller information.</p><Link className="text-link" href="/legal/privacy">Read our privacy notes <span>→</span></Link></div></section><section className="content-section shell content-narrow"><h2>Have a security question?</h2><p>Use the demo page to request a walkthrough and review your data flows before you put the service in front of customers.</p><Link className="button button--dark" href="/demo">Request a walkthrough <span>↗</span></Link></section></main><SiteFooter /></>;
}
