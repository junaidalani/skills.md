"use client";

import * as React from "react";
import Link from "next/link";
import * as THREE from "three";
import { ArrowRight, CalendarDays, MessageSquareText, PhoneForwarded, Play, Pause, RotateCcw } from "lucide-react";

export type ScannerServiceCard = {
  eyebrow: string;
  title: string;
  description: string;
  icon: "lead" | "transfer" | "followup";
  href?: string;
  footer?: React.ReactNode;
};

type ScannerCardStreamProps = {
  cards: ScannerServiceCard[];
  showControls?: boolean;
  showSpeed?: boolean;
  initialSpeed?: number;
  direction?: -1 | 1;
  repeat?: number;
  cardGap?: number;
  friction?: number;
  className?: string;
};

const ASCII_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789(){}[]<>;:,._-+=!@#$%^&*|/";

function deterministicCode(seed: number, width = 48, height = 18) {
  let state = seed * 2654435761 || 1;
  let output = "";
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      output += ASCII_CHARS[state % ASCII_CHARS.length];
    }
    output += "\n";
  }
  return output;
}

const ICONS = {
  lead: MessageSquareText,
  transfer: PhoneForwarded,
  followup: CalendarDays,
};

export function ScannerCardStream({
  cards,
  showControls = true,
  showSpeed = false,
  initialSpeed = 54,
  direction = -1,
  repeat = 5,
  cardGap = 24,
  friction = 0.94,
  className = "",
}: ScannerCardStreamProps) {
  const renderedCards = React.useMemo(
    () => Array.from({ length: cards.length * repeat }, (_, index) => ({
      ...cards[index % cards.length],
      id: index,
      ascii: deterministicCode(index + 11),
    })),
    [cards, repeat],
  );
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const lineRef = React.useRef<HTMLDivElement>(null);
  const particleCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const scannerCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const pointerStart = React.useRef(0);
  const pointerLast = React.useRef(0);
  const reducedRef = React.useRef(false);
  const pausedRef = React.useRef(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const [isScanning, setIsScanning] = React.useState(false);
  const [speed, setSpeed] = React.useState(initialSpeed);
  const state = React.useRef({ position: 0, velocity: initialSpeed, direction, dragging: false, lastTime: 0 });

  React.useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  const resetPosition = React.useCallback(() => {
    state.current.position = 0;
    state.current.velocity = initialSpeed;
    state.current.direction = direction;
    setSpeed(initialSpeed);
    setIsPaused(false);
  }, [direction, initialSpeed]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    const line = lineRef.current;
    const particleCanvas = particleCanvasRef.current;
    const scannerCanvas = scannerCanvasRef.current;
    if (!viewport || !line || !particleCanvas || !scannerCanvas) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => { reducedRef.current = media.matches; };
    syncMotion();
    media.addEventListener("change", syncMotion);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    const renderer = new THREE.WebGLRenderer({ canvas: particleCanvas, alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const particleCount = 360;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      positions[i * 3] = Math.random() * 2 - 1;
      positions[i * 3 + 1] = Math.random() * 2 - 1;
      positions[i * 3 + 2] = 0;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0x7db2bb, size: 0.006, transparent: true, opacity: 0.56, blending: THREE.AdditiveBlending, depthWrite: false });
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    const scanCtx = scannerCanvas.getContext("2d");
    let scannerDust = Array.from({ length: 350 }, () => ({ x: 0, y: 0, life: Math.random(), velocity: 0.2 + Math.random() * 0.8 }));
    let frame = 0;
    let lastSpeedUpdate = 0;
    let scanningLastFrame = false;

    const resize = () => {
      const rect = viewport.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      scannerCanvas.width = Math.max(1, Math.round(rect.width * dpr));
      scannerCanvas.height = Math.max(1, Math.round(rect.height * dpr));
      scannerCanvas.style.width = `${rect.width}px`;
      scannerCanvas.style.height = `${rect.height}px`;
      scanCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);

    const updateScan = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const scannerX = viewportRect.left + viewportRect.width / 2;
      let scanning = false;
      line.querySelectorAll<HTMLElement>("[data-scanner-card]").forEach((card) => {
        const rect = card.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (scannerX - rect.left) / Math.max(rect.width, 1)));
        const isPastStart = scannerX >= rect.left;
        card.style.setProperty("--scan", `${progress * 100}%`);
        card.dataset.scanned = isPastStart ? "true" : "false";
        if (scannerX >= rect.left - 3 && scannerX <= rect.right + 3) scanning = true;
      });
      if (scanning !== scanningLastFrame) {
        scanningLastFrame = scanning;
        setIsScanning(scanning);
      }
      return { scanning, width: viewportRect.width, height: viewportRect.height };
    };

    const animate = (time: number) => {
      const current = state.current;
      const delta = current.lastTime ? Math.min((time - current.lastTime) / 1000, 0.04) : 0;
      current.lastTime = time;
      const lineWidth = Math.max(line.scrollWidth / 2, 1);
      if (!pausedRef.current && !current.dragging && !reducedRef.current) {
        current.velocity += (initialSpeed - current.velocity) * (1 - friction) * 0.45;
        current.position += current.velocity * current.direction * delta;
      }
      if (current.position <= -lineWidth) current.position += lineWidth;
      if (current.position >= 0) current.position -= lineWidth;
      line.style.transform = `translate3d(${current.position}px,0,0)`;

      const scan = updateScan();
      const positionAttribute = geometry.getAttribute("position") as THREE.BufferAttribute;
      const values = positionAttribute.array as Float32Array;
      for (let i = 0; i < particleCount; i += 1) {
        values[i * 3] += (0.0004 + (i % 11) * 0.000025) * current.direction;
        if (values[i * 3] > 1.05) values[i * 3] = -1.05;
        if (values[i * 3] < -1.05) values[i * 3] = 1.05;
      }
      positionAttribute.needsUpdate = true;
      renderer.render(scene, camera);

      if (scanCtx) {
        scanCtx.clearRect(0, 0, scan.width, scan.height);
        if (scan.scanning && !reducedRef.current) {
          const center = scan.width / 2;
          scannerDust.forEach((dust) => {
            dust.x += dust.velocity;
            dust.life -= 0.008;
            if (dust.life <= 0 || dust.x > 70) dust = Object.assign(dust, { x: 0, y: Math.random() * scan.height, life: 0.4 + Math.random() * 0.6, velocity: 0.2 + Math.random() * 0.8 });
            scanCtx.globalAlpha = dust.life * 0.55;
            scanCtx.fillStyle = "#d7f4f3";
            scanCtx.beginPath();
            scanCtx.arc(center + dust.x, dust.y, 0.45 + dust.life, 0, Math.PI * 2);
            scanCtx.fill();
          });
          scanCtx.globalAlpha = 1;
        }
      }
      if (time - lastSpeedUpdate > 250) {
        setSpeed(Math.round(Math.abs(current.velocity)));
        lastSpeedUpdate = time;
      }
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener("change", syncMotion);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      scannerDust = [];
    };
  }, [friction, initialSpeed, renderedCards.length]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    state.current.dragging = true;
    pointerStart.current = event.clientX;
    pointerLast.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!state.current.dragging) return;
    const delta = event.clientX - pointerLast.current;
    pointerLast.current = event.clientX;
    state.current.position += delta;
    state.current.velocity = Math.min(260, Math.max(30, Math.abs(delta) * 18));
    state.current.direction = delta >= 0 ? 1 : -1;
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    state.current.dragging = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY)) return;
    event.preventDefault();
    state.current.position -= event.deltaX;
    state.current.direction = event.deltaX > 0 ? -1 : 1;
  };

  return (
    <div className={`scanner-stream ${className}`}>
      <div className="scanner-stream__status">
        <span><i className={isScanning ? "is-live" : ""} /> {isScanning ? "Reading handoff" : "Ready to scan"}</span>
        {showSpeed && <span>{speed} px/s</span>}
      </div>
      {showControls && (
        <div className="scanner-stream__controls" aria-label="Scanner controls">
          <button type="button" onClick={() => setIsPaused((value) => !value)} aria-label={isPaused ? "Resume cards" : "Pause cards"}>
            {isPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => { state.current.direction *= -1; }} aria-label="Reverse card direction">
            <ArrowRight aria-hidden="true" />
          </button>
          <button type="button" onClick={resetPosition} aria-label="Reset cards">
            <RotateCcw aria-hidden="true" />
          </button>
        </div>
      )}
      <div
        ref={viewportRef}
        className="scanner-stream__viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <canvas ref={particleCanvasRef} className="scanner-stream__particles" aria-hidden="true" />
        <canvas ref={scannerCanvasRef} className="scanner-stream__dust" aria-hidden="true" />
        <div className={`scanner-stream__beam${isScanning ? " is-scanning" : ""}`} aria-hidden="true" />
        <div ref={lineRef} className="scanner-stream__line" style={{ gap: `${cardGap}px` }}>
          {[...renderedCards, ...renderedCards].map((card, listIndex) => {
            const Icon = ICONS[card.icon];
            const body = (
              <>
                <div className="scanner-service-card__icon"><Icon aria-hidden="true" /></div>
                <span className="scanner-service-card__eyebrow">{card.eyebrow}</span>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <div className="scanner-service-card__footer">{card.footer}</div>
              </>
            );
            return (
              <article className="scanner-service-card" data-scanner-card key={`${card.id}-${listIndex}`}>
                <div className="scanner-service-card__normal">{card.href ? <Link href={card.href}>{body}</Link> : body}</div>
                <div className="scanner-service-card__ascii" aria-hidden="true"><pre>{card.ascii}</pre><strong>{card.title}</strong></div>
              </article>
            );
          })}
        </div>
      </div>
      <p className="scanner-stream__hint">Drag the cards · use Shift + wheel · scan the center line</p>
    </div>
  );
}
