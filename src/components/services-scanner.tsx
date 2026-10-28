"use client";

import Link from "next/link";
import { ScannerCardStream, type ScannerServiceCard } from "@/components/ui/scanner-card-stream";

const SERVICE_CARDS: ScannerServiceCard[] = [
  {
    eyebrow: "Always on",
    title: "Lead capture that’s ready to act on",
    description: "Name, callback number, what happened, and when they need help. Your dashboard keeps it organized.",
    icon: "lead",
    href: "/how-it-works",
    footer: (
      <>
        <div className="scanner-lead-summary">
          <div className="scanner-lead-summary__head"><span>New call summary</span><i>just now</i></div>
          <div className="scanner-lead-summary__person"><span>JL</span><div><b>Jordan Lee</b><small>AC not cooling · urgent</small></div><em>New lead</em></div>
          <div className="scanner-lead-summary__foot"><span>Callback requested</span><span>↗</span></div>
        </div>
        <span className="scanner-service-card__link">See call flow <b>→</b></span>
      </>
    ),
  },
  {
    eyebrow: "When you need it",
    title: "A human, one step away",
    description: "Set transfer rules for office hours or “speak to a person.” If no one picks up, the agent takes a message.",
    icon: "transfer",
    footer: <div className="scanner-transfer"><b>Live transfer</b><span>Optional · configure first</span></div>,
  },
  {
    eyebrow: "A clearer next step",
    title: "Voicemail, text-back, booking",
    description: "Layer in follow-up services after you connect the phone, email, and calendar providers you use.",
    icon: "followup",
    footer: (
      <div>
        <div className="scanner-chip-row"><span>Voicemail</span><span>Calendar</span><span>SMS*</span></div>
        <small className="scanner-sms-note">*US business texting requires carrier registration.</small>
      </div>
    ),
  },
];

export function ServicesScanner() {
  return (
    <section className="scanner-services">
      <div className="shell scanner-services__heading">
        <div>
          <span className="eyebrow eyebrow--light">A dependable first line</span>
          <h2>More than a hello.<br /><em>A thoughtful handoff.</em></h2>
        </div>
        <div>
          <p>Start with the essentials. Add the phone services your business actually needs—without switching on risky features by accident.</p>
          <Link href="/how-it-works">See the complete call flow <span>→</span></Link>
        </div>
      </div>
      <ScannerCardStream cards={SERVICE_CARDS} initialSpeed={56} cardGap={24} repeat={4} />
    </section>
  );
}
