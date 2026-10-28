import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Field notes", description: "Practical notes for building a responsible AI phone answering workflow." };
const articles = [
  { tag: "SETUP", title: "A five-call checklist before you forward your main line", excerpt: "Test normal, interrupting, silent, difficult, and pushy callers before a real customer reaches the agent.", href: "/how-it-works" },
  { tag: "SAFETY", title: "What a good AI greeting should disclose", excerpt: "Set a clear expectation that the caller is speaking with an AI, and make recording notices match the jurisdictions you serve.", href: "/legal/ai-disclosure" },
  { tag: "OPERATIONS", title: "How to decide whether live transfer belongs in your call flow", excerpt: "Choose explicit office-hour rules, a backup message path, and a real person who owns the handoff.", href: "/how-it-works" },
];
export default function BlogPage() { return <><SiteHeader /><main><section className="page-hero"><div className="shell page-hero__inner"><span className="eyebrow">Field notes</span><h1>Small lessons for<br /><em>better first calls.</em></h1><p>Practical notes on call handling, safe handoffs, and building a voice workflow that respects your customers.</p></div></section><section className="content-section shell"><div className="steps-grid">{articles.map((article, index) => <article className="step-card" key={article.title}><span className="step-card__num">{article.tag} · 0{index + 1}</span><h2>{article.title}</h2><p>{article.excerpt}</p><Link className="text-link" href={article.href}>Read the guide <span>→</span></Link></article>)}</div></section></main><SiteFooter /></>; }
