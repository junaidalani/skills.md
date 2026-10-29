"use client";

import * as React from "react";

export interface HalftonePalette {
  background: string;
  ink: string;
  warm: string;
}

export type HalftonePreset = "night" | "paper" | "ember" | "cobalt";
export interface FooterLink { label: string; href?: string }
export interface FooterColumn { title: string; links: FooterLink[] }

export interface HalftoneWordmarkFooterProps {
  wordmark?: string;
  label?: string;
  meta?: string;
  columns?: FooterColumn[];
  backToTop?: boolean;
  preset?: HalftonePreset;
  palette?: Partial<HalftonePalette>;
  dotGap?: number;
  radius?: number;
  crop?: number;
  grain?: number;
  interactive?: boolean;
  fontFamily?: string;
  fontWeight?: number;
  monoFamily?: string;
  height?: string;
  className?: string;
}

const PRESETS: Record<HalftonePreset, HalftonePalette> = {
  night: { background: "#07131c", ink: "#d8e8e9", warm: "#c39355" },
  paper: { background: "#f5f8f8", ink: "#172a35", warm: "#3c7f8f" },
  ember: { background: "#160a06", ink: "#f2c48c", warm: "#ff5a1f" },
  cobalt: { background: "#0d1b4d", ink: "#dfe7ff", warm: "#ffcd3c" },
};

const DEFAULT_COLUMNS: FooterColumn[] = [
  { title: "Product", links: [{ label: "How it works", href: "/how-it-works" }, { label: "Plans & pricing", href: "/pricing" }, { label: "Listen to the demo", href: "/demo" }] },
  { title: "Explore", links: [{ label: "For HVAC", href: "/industries/hvac" }, { label: "For plumbing", href: "/industries/plumbing" }, { label: "For property teams", href: "/industries/property-management" }] },
  { title: "Company", links: [{ label: "Security", href: "/security" }, { label: "Privacy", href: "/legal/privacy" }, { label: "Terms", href: "/legal/terms" }] },
];

const SANS_STACK = 'Inter, "Helvetica Neue", Arial, system-ui, sans-serif';
const MONO_STACK = '"SF Mono", ui-monospace, Menlo, Consolas, monospace';

export function hwfHex(hex: string) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!match) return null;
  const normalized = match[1].length === 3 ? match[1].split("").map((character) => character + character).join("") : match[1];
  return [parseInt(normalized.slice(0, 2), 16), parseInt(normalized.slice(2, 4), 16), parseInt(normalized.slice(4, 6), 16)];
}
export function hwfRadius(coverage: number, gap: number) {
  return Math.sqrt(Math.max(0, Math.min(1, coverage))) * gap * 0.56;
}
export function hwfStep(x: number, y: number, vx: number, vy: number, hx: number, hy: number, px: number, py: number, radius: number) {
  const dx = x - px;
  const dy = y - py;
  const distanceSquared = dx * dx + dy * dy;
  if (radius > 0 && distanceSquared < radius * radius) {
    const distance = Math.sqrt(distanceSquared) + 0.001;
    const force = (1 - distance / radius) * 2.6;
    vx += (dx / distance) * force;
    vy += (dy / distance) * force;
  }
  vx = (vx + (hx - x) * 0.05) * 0.84;
  vy = (vy + (hy - y) * 0.05) * 0.84;
  return [x + vx, y + vy, vx, vy] as const;
}
export function hwfWarmth(x: number, y: number, hx: number, hy: number, span: number) {
  const distance = Math.hypot(x - hx, y - hy);
  return span > 0 ? Math.min(1, distance / span) : 0;
}
export function hwfFitSize(measured: number, width: number) {
  return measured > 0 ? (width / measured) * 100 : 0;
}

export default function HalftoneWordmarkFooter({
  wordmark = "agents",
  label = "Agent Caller",
  meta = `©${new Date().getFullYear()} · Inbound-first voice agents`,
  columns = DEFAULT_COLUMNS,
  backToTop = true,
  preset = "night",
  palette,
  dotGap = 6,
  radius = 80,
  crop = 0.2,
  grain = 0.5,
  interactive = true,
  fontFamily = SANS_STACK,
  fontWeight = 800,
  monoFamily = MONO_STACK,
  height = "560px",
  className = "",
}: HalftoneWordmarkFooterProps) {
  const colors = React.useMemo(() => ({ ...PRESETS[preset], ...palette }), [palette, preset]);
  const rootRef = React.useRef<HTMLElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const options = React.useRef({ colors, dotGap, radius, crop, grain, interactive, fontFamily, fontWeight, wordmark });
  options.current = { colors, dotGap, radius, crop, grain, interactive, fontFamily, fontWeight, wordmark };

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let heightPx = 0;
    let dpr = 1;
    let pointerX = -100000;
    let pointerY = -100000;
    let animationFrame = 0;
    let visible = true;
    let awake = true;
    let shock = { x: 0, y: 0, time: -1 };
    let dots = new Float32Array(0);
    let count = 0;
    let grainTile: HTMLCanvasElement | null = null;

    const layout = () => {
      const current = options.current;
      const rect = root.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      heightPx = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(heightPx * dpr);

      const mask = document.createElement("canvas");
      mask.width = width;
      mask.height = heightPx;
      const maskContext = mask.getContext("2d", { willReadFrequently: true });
      if (!maskContext) return;
      maskContext.font = `${current.fontWeight} 100px ${current.fontFamily}`;
      const word = current.wordmark || " ";
      const fit = hwfFitSize(maskContext.measureText(word).width, width * 1.03);
      maskContext.font = `${current.fontWeight} ${fit}px ${current.fontFamily}`;
      const measurement = maskContext.measureText(word);
      const capHeight = measurement.actualBoundingBoxAscent || fit * 0.72;
      maskContext.fillStyle = "#000";
      maskContext.textBaseline = "alphabetic";
      maskContext.fillText(word, (width - measurement.width) / 2, heightPx + capHeight * Math.max(0, Math.min(0.6, current.crop)));
      const image = maskContext.getImageData(0, 0, width, heightPx).data;

      const gap = Math.max(3, current.dotGap);
      const values: number[] = [];
      for (let yCell = 0; yCell < Math.ceil(heightPx / gap); yCell += 1) {
        for (let xCell = 0; xCell < Math.ceil(width / gap); xCell += 1) {
          let sum = 0;
          for (let sy = 0; sy < 3; sy += 1) {
            for (let sx = 0; sx < 3; sx += 1) {
              const x = Math.min(width - 1, Math.floor(xCell * gap + ((sx + 0.5) * gap) / 3));
              const y = Math.min(heightPx - 1, Math.floor(yCell * gap + ((sy + 0.5) * gap) / 3));
              sum += image[(y * width + x) * 4 + 3];
            }
          }
          const coverage = sum / (9 * 255);
          if (coverage < 0.06) continue;
          const homeX = xCell * gap + gap / 2;
          const homeY = yCell * gap + gap / 2;
          values.push(homeX, homeY, 0, 0, homeX, homeY, hwfRadius(coverage, gap));
        }
      }
      dots = new Float32Array(values);
      count = values.length / 7;

      grainTile = document.createElement("canvas");
      grainTile.width = 128;
      grainTile.height = 128;
      const grainContext = grainTile.getContext("2d");
      if (grainContext) {
        const imageData = grainContext.createImageData(128, 128);
        for (let index = 0; index < imageData.data.length; index += 4) {
          const value = Math.random() * 255;
          imageData.data[index] = imageData.data[index + 1] = imageData.data[index + 2] = value;
          imageData.data[index + 3] = Math.random() < 0.5 ? 0 : 255;
        }
        grainContext.putImageData(imageData, 0, 0);
      }
      awake = true;
    };

    const draw = (now: number) => {
      const current = options.current;
      const ink = hwfHex(current.colors.ink) || [216, 232, 233];
      const warm = hwfHex(current.colors.warm) || [195, 147, 85];
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = current.colors.background;
      context.fillRect(0, 0, width, heightPx);
      const pushRadius = current.interactive && !reduced ? Math.max(0, current.radius) : 0;
      const shockAge = shock.time < 0 ? Infinity : now - shock.time;
      const shockRadius = shockAge * 0.9;
      let moving = false;

      for (let index = 0; index < count; index += 1) {
        const offset = index * 7;
        let x = dots[offset];
        let y = dots[offset + 1];
        let vx = dots[offset + 2];
        let vy = dots[offset + 3];
        const homeX = dots[offset + 4];
        const homeY = dots[offset + 5];
        if (!reduced) {
          if (shockAge < 900) {
            const dx = homeX - shock.x;
            const dy = homeY - shock.y;
            const distance = Math.hypot(dx, dy) + 0.001;
            const band = 1 - Math.min(1, Math.abs(distance - shockRadius) / 26);
            if (band > 0) {
              const force = band * 3.2 * (1 - shockAge / 900);
              vx += (dx / distance) * force;
              vy += (dy / distance) * force;
            }
          }
          [x, y, vx, vy] = hwfStep(x, y, vx, vy, homeX, homeY, pointerX, pointerY, pushRadius);
          dots[offset] = x; dots[offset + 1] = y; dots[offset + 2] = vx; dots[offset + 3] = vy;
          moving ||= Math.abs(vx) + Math.abs(vy) > 0.02 || Math.abs(x - homeX) + Math.abs(y - homeY) > 0.05;
        }
        const warmth = hwfWarmth(x, y, homeX, homeY, 28);
        context.fillStyle = warmth > 0.02
          ? `rgb(${Math.round(ink[0] + (warm[0] - ink[0]) * warmth)},${Math.round(ink[1] + (warm[1] - ink[1]) * warmth)},${Math.round(ink[2] + (warm[2] - ink[2]) * warmth)})`
          : current.colors.ink;
        context.beginPath();
        context.arc(x, y, dots[offset + 6], 0, Math.PI * 2);
        context.fill();
      }

      if (grainTile && current.grain > 0) {
        context.globalAlpha = Math.min(1, current.grain) * 0.07;
        context.globalCompositeOperation = "overlay";
        const pattern = context.createPattern(grainTile, "repeat");
        if (pattern) { context.fillStyle = pattern; context.fillRect(0, 0, width, heightPx); }
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
      }
      awake = moving || shockAge < 900 || pointerX > -10000;
    };

    const loop = (now: number) => {
      animationFrame = 0;
      if (!visible) return;
      draw(now);
      if (awake) animationFrame = requestAnimationFrame(loop);
    };
    const wake = () => {
      awake = true;
      if (!animationFrame && visible) animationFrame = requestAnimationFrame(loop);
    };
    const localPoint = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return [event.clientX - bounds.left, event.clientY - bounds.top] as const;
    };
    const onMove = (event: PointerEvent) => {
      if (!options.current.interactive) return;
      [pointerX, pointerY] = localPoint(event);
      wake();
    };
    const onLeave = () => { pointerX = -100000; pointerY = -100000; wake(); };
    const onDown = (event: PointerEvent) => {
      if (!options.current.interactive || reduced || (event.target as HTMLElement).closest("a,button")) return;
      const [x, y] = localPoint(event);
      shock = { x, y, time: performance.now() };
      wake();
    };

    layout();
    draw(performance.now());
    wake();
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("pointerdown", onDown);
    const resizeObserver = new ResizeObserver(() => { layout(); wake(); });
    resizeObserver.observe(root);
    const intersectionObserver = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      if (visible) wake();
    });
    intersectionObserver.observe(root);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointerdown", onDown);
    };
  }, [colors, crop, dotGap, fontFamily, fontWeight, grain, interactive, radius, wordmark]);

  return (
    <footer
      ref={rootRef}
      className={`hwf-root ${className}`}
      style={{ height, "--hwf-bg": colors.background, "--hwf-ink": colors.ink, "--hwf-mono": monoFamily } as React.CSSProperties}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <span className="sr-only">{wordmark}</span>
      <div className="hwf-top">
        <div className="hwf-brand"><strong>{label}</strong><span>{meta}</span></div>
        {columns.map((column) => (
          <nav className="hwf-col" key={column.title} aria-label={column.title}>
            <h3>{column.title}</h3>
            <ul>{column.links.map((link) => <li key={link.label}><a href={link.href || "#"}>{link.label}</a></li>)}</ul>
          </nav>
        ))}
      </div>
      <div className="hwf-rule">
        <span>Good work shouldn’t have to wait by the phone.{" "}</span>
        {backToTop && <button type="button" className="hwf-up" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top ↑</button>}
      </div>
    </footer>
  );
}
