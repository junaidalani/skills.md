import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VideoAd } from "@/components/video-ad";

export const metadata: Metadata = { title: "Hear the demo", description: "Preview the Agent Caller call experience and start your own inbound call agent." };

export default function DemoPage() {
  const demoPhone = process.env.NEXT_PUBLIC_DEMO_PHONE;
  return <><SiteHeader /><main><section className="page-hero"><div className="shell page-hero__inner"><span className="eyebrow">A voice that picks up</span><h1>Hear the first <em>hello.</em></h1><p>Get a feel for the call experience, then shape an agent around your own hours, services, and handoff rules.</p></div></section><section className="content-section shell"><div className="demo-card">          <div className="demo-number"><span className="eyebrow eyebrow--light">LIVE DEMO LINE</span><h2>{demoPhone || "Watch the sample call below."}</h2><p>{demoPhone ? "Call the demo line to hear the example greeting and lead-capture flow." : "The public demo line is shown here once it is connected to the live voice service. Until then, the recording below plays the same call experience."}</p>{demoPhone ? <a className="button button--light" href={`tel:${demoPhone.replace(/[^+\d]/g, "")}`}>Call the demo <span>↗</span></a> : <a className="button button--light" href="#demo-recording">Play the sample call <span>↓</span></a>}</div>          <div className="demo-note"><span className="eyebrow">On this call</span><h3>See a full sample interaction.</h3><p>The recording below is the reference call experience: a friendly AI disclosure in the greeting, the right questions, and a clear lead summary for the team at the end.</p><p>Recording stays off by default. If you enable it, add the consent notice your locations require.</p></div></div></section><VideoAd /><section className="content-section shell content-narrow"><h2>Want to hear it on your own script?</h2><p>Start a workspace, add your services and business hours, then test your greeting before connecting a live line.</p><Link className="button button--dark" href="/signup">Start a 14-day trial <span>→</span></Link></section></main><SiteFooter /></>;
}
