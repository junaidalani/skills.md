"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export function VideoAd() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [videoAvailable, setVideoAvailable] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const section = sectionRef.current;
        if (!section) return;
        const rect = section.getBoundingClientRect();
        const span = rect.height + window.innerHeight;
        const value = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / span));
        setProgress(value);
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => { window.removeEventListener("scroll", update); cancelAnimationFrame(frame); };
  }, []);

  return (
    <section className="video-story" ref={sectionRef} aria-labelledby="video-story-title">
      <div className="shell video-story__grid">
        <div className="video-story__copy">
          <span className="eyebrow eyebrow--light">A little less phone tag</span>
          <h2 id="video-story-title">You keep the work moving.<br /><em>We’ll keep the calls moving.</em></h2>
          <p>See what happens when a customer calls in the middle of a job: a warm hello, the right questions, and a useful message waiting for your team.</p>
          <div className="video-story__steps">
            {["The phone rings", "Your agent answers", "A lead lands in your dashboard"].map((step, index) => <div className={progress > index / 3 ? "is-current" : ""} key={step}><span>0{index + 1}</span>{step}</div>)}
          </div>
          <p className="video-story__small">Inbound-first by design. Your team stays in control of the follow-up.</p>
        </div>
        <div className="video-ad-frame">
          <Image className="video-ad-frame__poster" src="/images/hero-hvac.jpg" alt="HVAC technician at work as a call comes in" fill sizes="(max-width: 800px) 100vw, 50vw" />
          <div className="video-ad-frame__shade" />
          <video
            ref={videoRef}
            className={`video-ad-frame__video${videoAvailable ? " video-ad-frame__video--ready" : ""}`}
            hidden={!videoAvailable}
            src="/media/voice-agent-demo.mp4"
            poster="/images/hero-hvac.jpg"
            controls
            playsInline
            preload="metadata"
            onCanPlay={() => setVideoAvailable(true)}
            onError={() => setVideoAvailable(false)}
            aria-label="Agent Caller voice agent video advertisement"
          />
          {!videoAvailable && <div className="video-ad-frame__overlay"><span className="video-ad-frame__play" aria-hidden="true">▶</span><strong>Hear a calmer kind of first response.</strong><span>Drop your finished video at <code>public/media/voice-agent-demo.mp4</code> to play it here—with its original sound.</span></div>}
          <div className="video-ad-frame__badge"><span className="live-dot" /> ALWAYS READY TO ANSWER</div>
          <div className="video-ad-frame__caption"><span>YOUR CUSTOMER</span><strong>“Can someone help with the AC?”</strong><span className="caption-response">A friendly first response, even while your crew is on a job.</span></div>
        </div>
      </div>
    </section>
  );
}
