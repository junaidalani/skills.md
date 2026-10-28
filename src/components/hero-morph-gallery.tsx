"use client";

import { useState } from "react";
import MorphGallery, { type MorphItem } from "@/components/ui/morph-gallery";

type IndustrySlide = MorphItem & { link: string; label: string; line: string; example: string };

const ITEMS: IndustrySlide[] = [
  {
    src: "/images/hero-hvac.jpg",
    thumb: "/images/hero-hvac.jpg",
    alt: "HVAC business at work",
    link: "/industries/hvac",
    label: "HVAC",
    line: "Catch the repair call while your hands are on the job.",
    example: "“My AC stopped cooling.” → capture the address and urgency.",
  },
  {
    src: "/images/industry-plumbing.jpg",
    thumb: "/images/industry-plumbing.jpg",
    alt: "Plumbing business at work",
    link: "/industries/plumbing",
    label: "Plumbing",
    line: "Turn an urgent leak into a clear, ready-to-call lead.",
    example: "“There’s water under the sink.” → ask where and when it started.",
  },
  {
    src: "/images/industry-roofing.jpg",
    thumb: "/images/industry-roofing.jpg",
    alt: "Roofing business at work",
    link: "/industries/roofing",
    label: "Roofing",
    line: "Keep estimate requests moving while your crew is on the roof.",
    example: "“I need a roof inspection.” → collect the property and timeline.",
  },
  {
    src: "/images/industry-dental.jpg",
    thumb: "/images/industry-dental.jpg",
    alt: "Dental practice at work",
    link: "/industries/dental",
    label: "Dental",
    line: "Handle appointment requests without sharing patient advice.",
    example: "“Can I book a cleaning?” → capture a callback preference.",
  },
  {
    src: "/images/industry-law.jpg",
    thumb: "/images/industry-law.jpg",
    alt: "Legal intake team at work",
    link: "/industries/law",
    label: "Legal intake",
    line: "Gather a first-call summary and route it to your intake team.",
    example: "“I need to speak with an attorney.” → capture a safe callback request.",
  },
  {
    src: "/images/industry-auto.jpg",
    thumb: "/images/industry-auto.jpg",
    alt: "Auto repair shop at work",
    link: "/industries/auto-repair",
    label: "Auto repair",
    line: "Take down the vehicle, the issue, and the best time to call back.",
    example: "“My car won’t start.” → gather the make, model, and location.",
  },
  {
    src: "/images/industry-property.jpg",
    thumb: "/images/industry-property.jpg",
    alt: "Property management team at work",
    link: "/industries/property-management",
    label: "Property teams",
    line: "Route maintenance requests and after-hours messages clearly.",
    example: "“The heat is out in unit 4.” → capture the unit and urgency.",
  },
];

export function HeroMorphGallery() {
  const [index, setIndex] = useState(0);
  const current = ITEMS[index] ?? ITEMS[0];

  return (
    <section className="morph-hero" aria-label="Industries Agent Caller answers for">
      <MorphGallery
        items={ITEMS}
        height="78svh"
        autoplay={4500}
        duration={1400}
        noiseScale={3.2}
        edge={0.16}
        drift={0.42}
        links={ITEMS.map((item) => item.link)}
        linkLabel={`Explore ${current.label}`}
        onIndexChange={setIndex}
        className="morph-hero__gallery"
      />
      <div className="morph-hero__caption">
        <span className="eyebrow eyebrow--light">
          {current.label} · {String(index + 1).padStart(2, "0")} / {String(ITEMS.length).padStart(2, "0")}
        </span>
        <p>{current.line}</p>
        <small>{current.example}</small>
        <span className="morph-hero__caption-hint">Click the photo to open the {current.label} guide →</span>
      </div>
    </section>
  );
}
