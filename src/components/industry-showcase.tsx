"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";

const industries = [
  { name: "HVAC", slug: "hvac", image: "/images/hero-hvac.jpg", note: "Catch the repair call while your hands are on the job.", script: "“My AC stopped cooling.” → capture the address and urgency." },
  { name: "Plumbing", slug: "plumbing", image: "/images/industry-plumbing.jpg", note: "Turn an urgent leak into a clear, ready-to-call lead.", script: "“There’s water under the sink.” → ask where and when it started." },
  { name: "Roofing", slug: "roofing", image: "/images/industry-roofing.jpg", note: "Keep estimate requests moving while your crew is on the roof.", script: "“I need a roof inspection.” → collect the property and timeline." },
  { name: "Dental", slug: "dental", image: "/images/industry-dental.jpg", note: "Handle routine appointment requests without sharing patient advice.", script: "“Can I book a cleaning?” → capture a callback preference." },
  { name: "Legal intake", slug: "law", image: "/images/industry-law.jpg", note: "Gather a first-call summary and route it to your intake team.", script: "“I need to speak with an attorney.” → capture a safe callback request." },
  { name: "Auto repair", slug: "auto-repair", image: "/images/industry-auto.jpg", note: "Take down the vehicle, issue, and best time to call back.", script: "“My car won’t start.” → gather the make, model, and location." },
  { name: "Property teams", slug: "property-management", image: "/images/industry-property.jpg", note: "Route maintenance requests and after-hours messages clearly.", script: "“The heat is out in unit 4.” → capture the unit and urgency." },
];

export function IndustryShowcase() {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const select = (index: number) => {
    const next = Math.max(0, Math.min(industries.length - 1, index));
    setActive(next);
    scroller.current?.children[next]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };
  return (
    <div className="industry-showcase">
      <div className="industry-showcase__top">
        <div><span className="eyebrow">A better first hello</span><h2>Built for work that<br />doesn’t sit at a desk.</h2></div>
        <div className="industry-controls" aria-label="Choose an industry">
          <button type="button" onClick={() => select(active - 1)} aria-label="Previous industry">←</button>
          <span>{String(active + 1).padStart(2, "0")} <i>/</i> {String(industries.length).padStart(2, "0")}</span>
          <button type="button" onClick={() => select(active + 1)} aria-label="Next industry">→</button>
        </div>
      </div>
      <div className="industry-track" ref={scroller} onScroll={(event) => { const el = event.currentTarget; const next = Math.round(el.scrollLeft / (el.querySelector(".industry-card")?.clientWidth || 1)); setActive(Math.min(industries.length - 1, next)); }}>
        {industries.map((industry, index) => (
          <article key={industry.slug} className={`industry-card${index === active ? " is-active" : ""}`}>
            <Link className="industry-card__image" href={`/industries/${industry.slug}`} aria-label={`Explore Agent Caller for ${industry.name}`}>
              <Image src={industry.image} alt={`${industry.name} business at work`} fill sizes="(max-width: 700px) 82vw, 34vw" priority={index < 2} />
              <span className="industry-card__number">0{index + 1}</span><span className="industry-card__arrow">↗</span>
            </Link>
            <div className="industry-card__copy"><span className="eyebrow">{industry.name}</span><p>{industry.note}</p><div className="industry-card__script"><span>EXAMPLE CALL</span><p>{industry.script}</p></div></div>
          </article>
        ))}
      </div>
      <div className="industry-dots" aria-label="Industry navigation">{industries.map((industry, index) => <button type="button" aria-label={`Show ${industry.name}`} aria-current={active === index} onClick={() => select(index)} key={industry.slug} />)}</div>
    </div>
  );
}
