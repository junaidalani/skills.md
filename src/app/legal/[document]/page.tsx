import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const documents: Record<string, { title: string; intro: string; sections: Array<[string, string]> }> = {
  terms: {
    title: "Terms of service",
    intro: "These starter terms describe the intended use of Agent Caller. They are a product template and need review by qualified counsel before commercial launch.",
    sections: [
      ["Use of the service", "Agent Caller helps answer inbound calls and organize follow-up. You are responsible for the accuracy of your business information, the way you configure the agent, and the actions taken by your team."],
      ["AI limitations", "AI-generated speech, summaries, and extracted details may be incomplete or wrong. The service is not a substitute for professional judgment, emergency response, or a human review of important information."],
      ["Acceptable use", "Do not use Agent Caller to collect payment-card numbers, handle protected health information, make unconsented outbound sales calls, or violate telephone, privacy, recording, or messaging laws."],
      ["Provider costs and availability", "Third-party phone, AI, email, hosting, and payment services may have their own terms, fees, limits, and availability. Prices and provider capabilities can change."],
      ["Availability and liability", "Service is provided on a best-effort basis. Do not promise a 99.9% uptime level unless separately contracted and supported by evidence. A lawyer should add appropriate limitation of liability, indemnity, warranty, termination, and governing-law terms."],
    ],
  },
  privacy: {
    title: "Privacy policy",
    intro: "This starter privacy notice explains the intended data flows. It is not a final legal document. Set the actual retention periods and vendor list for your deployment, then have counsel review it.",
    sections: [
      ["Information in a workspace", "Account details, agent settings, provider metadata, phone numbers, call duration, lead information, and call summaries may be stored so the workspace can function. Transcripts and recordings should be treated as personal information."],
      ["Purpose and access", "Workspace members use the dashboard to review calls and follow up. Tenant scoping is applied to application queries. Platform operators should not have a feature that reveals a customer’s raw provider key."],
      ["Service providers", "Depending on configuration, subprocessors may include your phone carrier (such as Telnyx), speech-to-text, language-model and text-to-speech providers, Stripe, your email sender, hosting, and database providers. List the exact providers used in your deployment."],
      ["Retention and deletion", "Choose and publish specific transcript, recording, and backup retention windows. Provide a way for customers to export and delete data, and confirm deletion behavior with each subprocessor."],
      ["Call recording and transcription", "Tell callers when an AI is answering. Obtain any recording or transcription consent required where your business and callers are located. Recording is optional and should remain off until configured."],
      ["International and regulated data", "Assess applicable privacy and telecom rules, including GDPR where relevant. This product is not represented as HIPAA compliant and must not be used for protected health information or payment-card collection."],
    ],
  },
  "ai-disclosure": {
    title: "AI and call recording disclosure",
    intro: "A call agent should set an honest expectation from the first sentence. Adapt this guidance to your local recording, privacy, and telecom requirements.",
    sections: [
      ["Say it is an AI", "Use a plain greeting such as: “Thanks for calling [Business]. I’m the AI assistant. How can I help today?” Do not imply that the caller is speaking with a human."],
      ["If the call may be recorded or transcribed", "Add a clear notice before recording or transcription begins where required. Some locations require consent from every party. Decide how callers can decline and how the call should continue."],
      ["Avoid unsafe information", "Never ask for payment-card numbers. Avoid medical records, passwords, government identifiers, or other sensitive data. Route complex questions to a person and make it clear the agent can make mistakes."],
      ["Outbound calls", "Keep outbound calling disabled by default. Only make callbacks that the person requested and for which your business has a valid consent record. Follow do-not-call and permitted-hours rules."],
    ],
  },
};

export function generateStaticParams() { return Object.keys(documents).map((document) => ({ document })); }
export async function generateMetadata({ params }: { params: Promise<{ document: string }> }): Promise<Metadata> { const { document } = await params; return documents[document] ? { title: documents[document].title } : {}; }

export default async function LegalDocumentPage({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  const page = documents[document];
  if (!page) notFound();
  return <><SiteHeader /><main><section className="page-hero"><div className="shell page-hero__inner"><span className="eyebrow">Agent Caller · Legal</span><h1>{page.title}</h1><p>{page.intro}</p></div></section><section className="content-section shell content-narrow">{page.sections.map(([title, body]) => <section key={title}><h2>{title}</h2><p>{body}</p></section>)}<p><strong>Important:</strong> These pages are starter copy for a software build, not legal advice. Replace examples with your actual practices, dates, business entity, subprocessors, contact route, and jurisdiction-specific requirements.</p><Link className="text-link" href="/security">Review security notes <span>→</span></Link></section></main><SiteFooter /></>;
}
