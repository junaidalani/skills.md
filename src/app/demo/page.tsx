import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VideoAd } from "@/components/video-ad";

export const metadata: Metadata = { title: "Hear the demo", description: "Preview the Agent Caller call experience and start your own inbound call agent." };

export default function DemoPage() {
  const demoPhone = process.env.NEXT_PUBLIC_DEMO_PHONE;
  return <><SiteHeader /><main><section className="page-hero"><div className="shell page-hero__inner"><span className="eyebrow">A voice that picks up</span><h1>Hear the first <em>hello.</em></h1><p>Get a feel for the call experience, then shape an agent around your own hours, services, and handoff rules.</p></div></section><section className="content-section shell"><div className="demo-card"><div className="demo-number"><span className="eyebrow eyebrow--light">LIVE DEMO LINE</span><h2>{demoPhone || "Your demo line is being prepared."}</h2><p>{demoPhone ? "Call the demo line to hear an example greeting and lead-capture flow." : "No public demo number has been configured yet. We won’t display a placeholder number as if it were live."}</p>{demoPhone ? <a className="button button--light" href={`tel:${demoPhone.replace(/[^+\d]/g, "")}`}>Call the demo <span>↗</span></a> : <Link className="button button--light" href="/signup">Create your workspace <span>→</span></Link>}</div><div className="demo-note"><span className="eyebrow">A note on your video</span><h3>Your voice-agent ad, with sound.</h3><p>The homepage has a still fallback so it looks complete even without the clip. Add your video file as <code>public/media/voice-agent-demo.mp4</code> and the player will use the original audio on this page too.</p><p>Callers should hear an AI disclosure in the greeting. Recording stays off unless you enable it and add the notice your locations require.</p></div></div></section><VideoAd /><section className="content-section shell content-narrow"><h2>Want to hear it on your own script?</h2><p>Start a workspace, add your services and business hours, then test your greeting before connecting a live line.</p><Link className="button button--dark" href="/signup">Start a 14-day trial <span>→</span></Link></section></main><SiteFooter /></>;
}
