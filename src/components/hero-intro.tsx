"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  ContainerAnimated,
  ContainerInset,
  ContainerScroll,
  ContainerSticky,
  HeroButton,
  HeroVideo,
} from "@/components/ui/animated-video-on-scroll";

export function HeroIntro() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  function toggleSound() {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setMuted(next);
    if (!next) void video.play();
  }

  const headline = (
    <>
      <div className="eyebrow eyebrow--light"><span className="eyebrow__dot" />YOUR NEXT CUSTOMER IS ON THE LINE</div>
      <h1>Good work shouldn’t have to <em>wait by the phone.</em></h1>
      <p>A friendly AI receptionist answers every inbound call, gathers the details, and gives your team a clear next step—while you stay on the job.</p>
    </>
  );

  const actions = (
    <div className="hero-intro__actions">
      <HeroButton
        type="button"
        className="hero-intro__cta"
        onClick={() => router.push("/signup")}
      >
        Start your 14-day trial <span aria-hidden="true">↗</span>
      </HeroButton>
      <Link className="hero-intro__ghost" href="/demo">Hear how it sounds <span aria-hidden="true">↗</span></Link>
      <Link className="hero-intro__ghost" href="/how-it-works">See how it works <span aria-hidden="true">→</span></Link>
    </div>
  );

  const trust = (
    <div className="hero-intro__trust">
      <span>14-day trial</span>
      <i />
      <span>No card to start</span>
      <i />
      <span>Inbound calls first</span>
    </div>
  );

  if (reduced) {
    return (
      <section className="hero-intro hero-intro--static" aria-label="Agent Caller introduction">
        <div className="hero-intro__static-copy">
          {headline}
          {actions}
          {trust}
        </div>
        <div className="hero-intro__static-media">
          <video
            ref={videoRef}
            src="/media/voice-agent-intro.mp4"
            poster="/images/hero-hvac.jpg"
            controls
            playsInline
            preload="metadata"
            aria-label="Agent Caller voice agent introduction"
          />
        </div>
      </section>
    );
  }

  return (
    <section className="hero-intro" aria-label="Agent Caller introduction">
      <ContainerScroll className="h-[280vh]">
        <ContainerSticky className="hero-intro__sticky">
          <ContainerAnimated className="hero-intro__copy">
            {headline}
            {trust}
          </ContainerAnimated>
          <ContainerInset className="hero-intro__frame">
            <HeroVideo
              ref={videoRef}
              src="/media/voice-agent-intro.mp4"
              poster="/images/hero-hvac.jpg"
              muted={muted}
              preload="metadata"
              aria-label="Agent Caller voice agent introduction"
            />
          </ContainerInset>
          <ContainerAnimated
            transition={{ delay: 0.35 }}
            outputRange={[-80, 0]}
            inputRange={[0, 0.7]}
            className="hero-intro__bottom"
          >
            {actions}
            <button type="button" className="hero-intro__sound" onClick={toggleSound} aria-pressed={!muted}>
              {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
              {muted ? "Play original sound" : "Sound on"}
            </button>
          </ContainerAnimated>
        </ContainerSticky>
      </ContainerScroll>
    </section>
  );
}
