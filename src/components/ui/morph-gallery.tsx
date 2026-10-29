"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Morph Gallery — a photo gallery whose slides dissolve into each other
 * through noise instead of cutting or cross-fading.
 *
 * The transition is one full-screen shader pass over two textures. An fbm
 * noise field gives every pixel a threshold, and the progress value sweeps
 * past those thresholds, so the outgoing frame tears away in drifting tatters
 * rather than fading uniformly. The threshold is biased by the luminance of
 * the *incoming* frame, which makes its bright areas burn through first — the
 * detail that stops it reading as a generic dissolve filter.
 *
 * Self-contained: raw WebGL, React is the only runtime dependency besides
 * lucide-react for the arrow icons. No gallery library, no animation library,
 * no CSS file. The canvas sizes itself from its own box.
 *
 * Textures need CORS. An image served without `Access-Control-Allow-Origin`
 * cannot be uploaded to WebGL at all, so the component detects that and falls
 * back to a plain DOM cross-fade — the gallery still works, it just stops
 * morphing. That is the difference between "no shader" and "black rectangle".
 */

export type MorphItem = {
  /** Full-size image. Must be served with CORS headers to be morphed. */
  src: string;
  /** Thumbnail for the strip. Falls back to `src`, which is wasteful. */
  thumb?: string;
  alt?: string;
};

export type MorphGalleryProps = {
  items: MorphItem[];
  /** **Must be a definite length.** The canvas fills this box. */
  height?: string;
  /** Milliseconds of dissolve. */
  duration?: number;
  /** fbm frequency. Higher tears into finer shreds. */
  noiseScale?: number;
  /** Width of the dissolve front, in threshold units. 0 is a hard edge. */
  edge?: number;
  /** How far the frames slide against each other while dissolving. */
  drift?: number;
  /** Wrap past the ends. */
  loop?: boolean;
  /** Milliseconds between automatic advances. 0 (default) is off. */
  autoplay?: number;
  arrows?: boolean;
  thumbnails?: boolean;
  /** Optional destination per slide. The active slide becomes a link. */
  links?: Array<string | undefined>;
  /** Label for the active slide's link, defaults to a generic label. */
  linkLabel?: string;
  /** Controlled index. Omit for uncontrolled. */
  index?: number;
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  className?: string;
};

/** Wrap past the ends when looping, clamp at them when not. */
export const wrapIndex = (i: number, n: number, loop: boolean): number => {
  if (n <= 0) return 0;
  return loop ? ((i % n) + n) % n : Math.min(Math.max(i, 0), n - 1);
};

/** Quintic in-out: the dissolve starts and ends still, and hurries the middle. */
export const easeInOutQuint = (t: number): number => {
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2;
};

/**
 * `object-fit: cover` expressed as a UV scale about the centre. Both factors
 * are <= 1: the sampled window shrinks, so the image crops rather than
 * stretching, whichever way the box is out of proportion.
 */
export const coverScale = (
  canvasAspect: number,
  imgAspect: number,
): [number, number] =>
  canvasAspect > imgAspect
    ? [1, imgAspect / canvasAspect]
    : [canvasAspect / imgAspect, 1];

const VERT = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform vec2 u_resolution;
uniform float u_fromAspect;
uniform float u_toAspect;
uniform float u_scale;
uniform float u_direction;
uniform float u_edge;
uniform float u_drift;

varying vec2 v_uv;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,
    0.366025403784439,
   -0.577350269189626,
    0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(
    permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0)
  );
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x  = 2.0 * fract(p * C.www) - 1.0;
  vec3 h  = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 v) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * snoise(v);
    v *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

vec2 mirror(vec2 uv) {
  return 1.0 - abs(1.0 - mod(uv, 2.0));
}

vec2 coverUV(vec2 uv, float imgAspect) {
  float canvasAspect = u_resolution.x / u_resolution.y;
  vec2 scale = (canvasAspect > imgAspect)
    ? vec2(1.0, imgAspect / canvasAspect)
    : vec2(canvasAspect / imgAspect, 1.0);
  return mirror((uv - 0.5) * scale + 0.5);
}

void main() {
  float adjusted = u_progress * (1.0 + 2.0 * u_edge) - u_edge;

  float noise = fbm(v_uv * u_scale + vec2(0.0, u_progress * u_direction)) * 0.5 + 0.5;
  noise = smoothstep(
    0.0,
    2.0,
    length(texture2D(u_to, coverUV(v_uv, u_toAspect)).rgb) + noise
  );

  float mixFactor = 1.0 - smoothstep(adjusted - u_edge, adjusted + u_edge, noise);

  vec2 fromUV = coverUV(
    v_uv + vec2(0.0, noise * u_progress * u_drift * u_direction),
    u_fromAspect
  );
  vec2 toUV = coverUV(
    v_uv + vec2(0.0, noise * (1.0 - u_progress) * -0.5 * u_drift * u_direction),
    u_toAspect
  );

  gl_FragColor = mix(texture2D(u_from, fromUV), texture2D(u_to, toUV), mixFactor);
}
`;

const compile = (gl: WebGLRenderingContext, type: number, src: string) => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("could not create shader");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("shader compile failed: " + log);
  }
  return shader;
};

const link = (gl: WebGLRenderingContext, vertSrc: string, fragSrc: string) => {
  const vert = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  if (!program) throw new Error("could not create program");
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error("program link failed: " + log);
  }
  return program;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not load " + src));
    img.src = src;
  });

export default function MorphGallery({
  items,
  height = "100svh",
  duration = 1500,
  noiseScale = 3.5,
  edge = 0.15,
  drift = 0.5,
  loop = true,
  autoplay = 0,
  arrows = true,
  thumbnails = true,
  links,
  linkLabel = "Explore this industry",
  index,
  defaultIndex = 0,
  onIndexChange,
  className = "",
}: MorphGalleryProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [uncontrolled, setUncontrolled] = React.useState(() =>
    wrapIndex(defaultIndex, items.length, loop),
  );
  const active = index === undefined ? uncontrolled : wrapIndex(index, items.length, loop);

  const [failed, setFailed] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [generation, setGeneration] = React.useState(0);
  const [reduced, setReduced] = React.useState(false);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const go = React.useCallback(
    (next: number) => {
      const wrapped = wrapIndex(next, items.length, loop);
      if (index === undefined) setUncontrolled(wrapped);
      onIndexChange?.(wrapped);
    },
    [index, items.length, loop, onIndexChange],
  );

  const tuning = React.useRef({ duration, noiseScale, edge, drift, reduced });
  React.useEffect(() => {
    tuning.current = { duration, noiseScale, edge, drift, reduced };
  });

  const request = React.useRef<{ from: number; to: number } | null>(null);
  const previous = React.useRef(active);
  React.useEffect(() => {
    if (previous.current === active) return;
    request.current = { from: previous.current, to: active };
    previous.current = active;
  }, [active]);

  const sources = items.map((item) => item.src).join("\n");

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || items.length === 0) return;

    const gl =
      canvas.getContext("webgl", { alpha: false, antialias: false }) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) {
      setFailed(true);
      return;
    }

    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    const textures: (WebGLTexture | null)[] = items.map(() => null);
    const aspects: number[] = items.map(() => 1);
    let raf = 0;
    let disposed = false;

    let from = active;
    let to = active;
    let progress = 1;
    let startedAt = 0;
    let direction = 1;

    const onLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(raf);
    };
    const onRestored = () => setGeneration((value) => value + 1);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(canvas.clientWidth * dpr);
      const heightPx = Math.round(canvas.clientHeight * dpr);
      if (width === 0 || heightPx === 0 || (canvas.width === width && canvas.height === heightPx)) return;
      canvas.width = width;
      canvas.height = heightPx;
      gl.viewport(0, 0, width, heightPx);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let uniforms: Record<string, WebGLUniformLocation | null> = {};
    const pick = (i: number) => textures[i] ?? textures.find((texture) => texture) ?? null;

    const draw = () => {
      if (disposed) return;
      const t = tuning.current;

      const pending = request.current;
      if (pending) {
        request.current = null;
        if (pending.from !== pending.to) {
          from = pending.from;
          to = pending.to;
          progress = 0;
          startedAt = performance.now();
          const n = items.length;
          const forward = loop
            ? ((pending.to - pending.from + n) % n) * 2 <= n
            : pending.to > pending.from;
          direction = forward ? 1 : -1;
        }
      }

      if (progress < 1) {
        const span = t.reduced ? 0 : Math.max(t.duration, 1);
        const elapsed = performance.now() - startedAt;
        progress = span === 0 ? 1 : easeInOutQuint(Math.min(elapsed / span, 1));
      }

      const fromTex = pick(from);
      const toTex = pick(to);
      if (!fromTex || !toTex) return;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fromTex);
      gl.uniform1i(uniforms.from, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, toTex);
      gl.uniform1i(uniforms.to, 1);

      gl.uniform1f(uniforms.progress, progress);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.fromAspect, aspects[from] ?? 1);
      gl.uniform1f(uniforms.toAspect, aspects[to] ?? 1);
      gl.uniform1f(uniforms.scale, t.noiseScale);
      gl.uniform1f(uniforms.direction, direction);
      gl.uniform1f(uniforms.edge, Math.max(t.edge, 0.001));
      gl.uniform1f(uniforms.drift, t.drift);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const frame = () => {
      draw();
      raf = requestAnimationFrame(frame);
    };

    const start = async () => {
      try {
        program = link(gl, VERT, FRAG);
        gl.useProgram(program);

        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
          gl.STATIC_DRAW,
        );
        const loc = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        for (const name of [
          "from", "to", "progress", "resolution",
          "fromAspect", "toAspect", "scale", "direction", "edge", "drift",
        ]) {
          uniforms[name] = gl.getUniformLocation(program, "u_" + name);
        }

        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

        let running = false;
        let refused = 0;
        await Promise.all(
          items.map((item, i) =>
            loadImage(item.src).then(
              (img) => {
                if (disposed) return;
                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                textures[i] = tex;
                aspects[i] = img.naturalWidth / Math.max(img.naturalHeight, 1);
                if (!running) {
                  running = true;
                  resize();
                  setReady(true);
                  raf = requestAnimationFrame(frame);
                }
              },
              () => {
                refused += 1;
                if (refused === items.length && !disposed) setFailed(true);
              },
            ),
          ),
        );
      } catch {
        if (!disposed) setFailed(true);
      }
    };
    void start();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      for (const tex of textures) if (tex) gl.deleteTexture(tex);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      textures.fill(null);
    };
    // `active` seeds the first frame; later changes arrive through `request`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, generation, items.length, loop]);

  React.useEffect(() => {
    if (!autoplay || reduced || paused || items.length < 2) return;
    const id = window.setInterval(() => go(active + 1), Math.max(autoplay, 600));
    return () => window.clearInterval(id);
  }, [autoplay, reduced, paused, active, go, items.length]);

  React.useEffect(() => {
    const sync = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const swipe = React.useRef<number | null>(null);
  const suppressClick = React.useRef(false);
  const onPointerDown = (event: React.PointerEvent) => {
    swipe.current = event.clientX;
    suppressClick.current = false;
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const startX = swipe.current;
    swipe.current = null;
    if (startX === null) return;
    const dx = event.clientX - startX;
    if (Math.abs(dx) > 48) {
      // A drag is a slide change, not a navigation request.
      suppressClick.current = true;
      go(active + (dx < 0 ? 1 : -1));
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 160);
    }
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(active - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(active + 1);
    }
  };

  const atStart = !loop && active === 0;
  const atEnd = !loop && active === items.length - 1;
  const current = items[active];

  const arrowClass =
    "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center " +
    "rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md " +
    "transition-colors hover:bg-white/25 focus-visible:outline focus-visible:outline-2 " +
    "focus-visible:outline-offset-2 focus-visible:outline-white " +
    "disabled:pointer-events-none disabled:opacity-25";

  return (
    <section
      className={"relative w-full overflow-hidden bg-black " + className}
      style={{ height }}
      role="region"
      aria-roledescription="carousel"
      aria-label="Image gallery"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {failed ? (
        items.map((item, i) => (
          <img
            key={item.src}
            src={item.src}
            alt={item.alt ?? ""}
            className="absolute inset-0 block h-full w-full object-cover transition-opacity duration-700 motion-reduce:transition-none"
            style={{ maxWidth: "none", opacity: i === active ? 1 : 0 }}
            aria-hidden={i !== active}
          />
        ))
      ) : (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full"
          style={{
            opacity: ready ? 1 : 0,
            transition: "opacity 400ms ease",
          }}
          aria-hidden="true"
        />
      )}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-56 bg-gradient-to-b from-transparent to-black/65"
        aria-hidden="true"
      />

      {links?.[active] && (
        <Link
          href={links[active] as string}
          className="morph-gallery__link"
          aria-label={`${linkLabel}: ${items[active]?.alt ?? `slide ${active + 1}`}`}
          onClick={(event) => {
            if (suppressClick.current) {
              event.preventDefault();
              suppressClick.current = false;
            }
          }}
        >
          <span className="morph-gallery__link-pill">
            {linkLabel}
            <ArrowUpRight size={15} aria-hidden="true" />
          </span>
        </Link>
      )}

      {arrows && items.length > 1 && (
        <>
          <button
            type="button"
            className={arrowClass + " left-4 sm:left-8"}
            onClick={() => go(active - 1)}
            disabled={atStart}
            aria-label="Previous image"
          >
            <ChevronLeft size={20} strokeWidth={2.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={arrowClass + " right-4 sm:right-8"}
            onClick={() => go(active + 1)}
            disabled={atEnd}
            aria-label="Next image"
          >
            <ChevronRight size={20} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </>
      )}

      {thumbnails && items.length > 1 && (
        <ul
          className={
            "absolute inset-x-0 bottom-8 z-10 mx-auto flex w-max max-w-[calc(100%-2rem)] gap-2 " +
            "list-none overflow-x-auto scroll-smooth p-0 pb-2.5 " +
            "[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:rounded [&::-webkit-scrollbar-track]:bg-white/10 " +
            "[&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-white/30 " +
            "max-sm:hidden"
          }
        >
          {items.map((item, i) => (
            <li key={item.src} className="shrink-0 list-none">
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === active}
                aria-label={item.alt ? "Show " + item.alt : "Show image " + (i + 1)}
                className={
                  "block cursor-pointer overflow-hidden rounded border-2 bg-transparent p-0 transition " +
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white " +
                  (i === active
                    ? "border-white opacity-100"
                    : "border-transparent opacity-55 hover:opacity-85")
                }
              >
                <img
                  src={item.thumb ?? item.src}
                  alt=""
                  width={80}
                  height={50}
                  loading="lazy"
                  decoding="async"
                  className="block object-cover"
                  style={{ maxWidth: "none", width: 80, height: 50 }}
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <span className="sr-only" aria-live="polite">
        {current ? current.alt ?? "Image " + (active + 1) : ""}
        {" — "}
        {active + 1} of {items.length}
      </span>
    </section>
  );
}
