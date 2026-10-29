"use client";

import * as React from "react";
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Typewriter } from "@/components/ui/typewriter-text";
import { cn } from "@/lib/utils";

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, ...props }, ref) => {
    const id = useId();
    const [showPassword, setShowPassword] = useState(false);
    return (
      <div className="grid w-full items-center gap-2">
        {label && <Label htmlFor={id}>{label}</Label>}
        <div className="relative">
          <Input
            id={id}
            type={showPassword ? "text" : "password"}
            className={cn("pe-10", className)}
            ref={ref}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShowPassword((previous) => !previous)}
            className="absolute inset-y-0 end-0 flex h-full w-10 items-center justify-center text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

type AuthContent = { image: { src: string; alt: string }; quote: { text: string; author: string } };

const SIGN_IN_CONTENT: AuthContent = {
  image: { src: "/images/industry-property.jpg", alt: "Property manager answering the working day" },
  quote: { text: "Welcome back. The phone kept ringing — your leads are waiting.", author: "Agent Caller" },
};

const SIGN_UP_CONTENT: AuthContent = {
  image: { src: "/images/hero-hvac.jpg", alt: "HVAC technician with a phone call coming in" },
  quote: { text: "Make room for the next call. It starts with a better first hello.", author: "Agent Caller" },
};

export function AuthUI({ initialMode = "signin" }: { initialMode?: "signin" | "signup" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">(initialMode === "signin" ? "signin" : "signup");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignIn = mode === "signin";
  const content = isSignIn ? SIGN_IN_CONTENT : SIGN_UP_CONTENT;

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("google");
    queueMicrotask(() => {
      if (reason === "unconfigured") setError("Google sign-in isn’t configured on this deployment yet. Use your email and password, or set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
      else if (reason) setError("Google sign-in couldn’t be completed. Try again or use your email and password.");
    });
  }, []);

  function switchMode(next: "signin" | "signup") {
    setMode(next);
    setError("");
    setNotice("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const response = await fetch("/api/auth/forgot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const payload = (await response.json()) as { error?: string; message?: string };
        if (!response.ok) {
          setError(payload.error || "Something went wrong. Please try again.");
          return;
        }
        setNotice(payload.message || "If that email has an account, a code is on its way.");
        setMode("reset");
        return;
      }
      if (mode === "reset") {
        const response = await fetch("/api/auth/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code, password }),
        });
        const payload = (await response.json()) as { error?: string; message?: string };
        if (!response.ok) {
          setError(payload.error || "Something went wrong. Please try again.");
          return;
        }
        setMode("signin");
        setNotice(payload.message || "Password updated. Sign in with your new password.");
        setPassword("");
        setCode("");
        return;
      }
      const planId = new URLSearchParams(window.location.search).get("plan") || "starter";
      const response = await fetch(mode === "signin" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signin" ? { email, password } : { name, businessName, email, password, planId },
        ),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Something went wrong. Please try again.");
        return;
      }
      setNotice(mode === "signup" ? "Workspace created. A confirmation email is on its way." : "");
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("We couldn’t reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "signin" ? "Sign in to your workspace"
    : mode === "signup" ? "Create your workspace"
    : mode === "forgot" ? "Reset your password"
    : "Enter your reset code";
  const subheading = mode === "signin"
    ? "Enter the email you use for Agent Caller to reach your calls and leads."
    : mode === "signup"
    ? "Start a 14-day trial. Your agent and dashboard are ready in a minute."
    : mode === "forgot"
    ? "We’ll email a 6-digit code to the address on your account."
    : "Check your email for the code, then choose a new password.";
  const submitLabel = mode === "signin" ? "Sign in to dashboard"
    : mode === "signup" ? "Create my workspace"
    : mode === "forgot" ? "Email me a code"
    : "Change my password";

  return (
    <div className="min-h-screen w-full bg-background md:grid md:grid-cols-[1fr_1.05fr]">
      <style>{`
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear { display: none; }
      `}</style>

      <div className="flex min-h-screen flex-col justify-center px-6 py-10 md:min-h-0 md:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-10 flex items-center justify-between gap-4">
            <Link className="brand" href="/" aria-label="Agent Caller home">
              <span className="brand__mark" aria-hidden="true"><span /><span /><span /></span>
              <span>agent caller</span>
            </Link>
            <Link href={mode === "signin" ? "/signup" : "/login"} className="text-xs font-semibold text-primary">
              {isSignIn ? "Start a trial" : mode === "signup" ? "Log in" : "Back to sign in"}
            </Link>
          </div>

          <form onSubmit={submit} autoComplete="on" className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{heading}</h1>
              <p className="text-sm text-muted-foreground">{subheading}</p>
            </div>

            <div className="grid gap-4">
              {mode === "signup" && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="auth-name">Your name</Label>
                    <Input
                      id="auth-name"
                      name="name"
                      autoComplete="name"
                      placeholder="Taylor Morgan"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      maxLength={100}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="auth-business">Business name</Label>
                    <Input
                      id="auth-business"
                      name="organization"
                      autoComplete="organization"
                      placeholder="Northstar Heating & Air"
                      value={businessName}
                      onChange={(event) => setBusinessName(event.target.value)}
                      required
                      maxLength={120}
                    />
                  </div>
                </>
              )}

              <div className="grid gap-2">
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@yourbusiness.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={254}
                />
              </div>

              {mode === "reset" && (
                <div className="grid gap-2">
                  <Label htmlFor="auth-code">6-digit code</Label>
                  <Input
                    id="auth-code"
                    name="one-time-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    minLength={6}
                    maxLength={6}
                  />
                </div>
              )}

              {mode !== "forgot" && (
                <>
                  <PasswordInput
                    name="password"
                    label={mode === "reset" ? "New password" : "Password"}
                    autoComplete={isSignIn ? "current-password" : "new-password"}
                    placeholder={isSignIn ? "Your password" : "At least 8 characters"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                  />
                  {isSignIn && (
                    <button
                      type="button"
                      onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}
                      className="-mt-1 self-end text-xs font-semibold text-primary"
                    >
                      Forgot password?
                    </button>
                  )}
                </>
              )}

              {notice && (
                <div className="form-success" role="status">
                  {notice}
                </div>
              )}

              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}

              <Button type="submit" className="mt-1 h-11 w-full font-semibold" disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                {busy ? "One moment…" : submitLabel}
              </Button>
            </div>
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" || mode === "signup" ? (
              <>
                {isSignIn ? "Don’t have an account?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => switchMode(isSignIn ? "signup" : "signin")}
                  className="font-semibold text-foreground underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                >
                  {isSignIn ? "Sign up" : "Sign in"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="font-semibold text-foreground underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
              >
                Back to sign in
              </button>
            )}
          </div>

          {(mode === "signin" || mode === "signup") && (
            <>
              <div className="relative my-6 text-center text-xs text-muted-foreground after:absolute after:inset-0 after:top-1/2 after:-z-10 after:border-t after:border-border">
                <span className="bg-background px-3">Or continue with</span>
              </div>

              <Button
                variant="outline"
                type="button"
                className="w-full"
                onClick={() => { window.location.href = "/api/auth/google/start"; }}
              >
                <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.7 2.4 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6C12.2 13.3 17.6 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.3h12.5c-.3 2.1-1.7 5.2-4.8 7.3l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.4z" />
                  <path fill="#FBBC05" d="M10.3 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l7.8-6z" />
                  <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.6l-7.6-5.9c-2.1 1.4-4.8 2.4-7.7 2.4-6.4 0-11.8-3.8-13.7-9.2l-7.8 6C6.4 42.6 14.6 48 24 48z" />
                </svg>
                Continue with Google
              </Button>
            </>
          )}

          <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
            {isSignIn
              ? "Your password is never shared with your voice providers. Provider keys stay encrypted and masked."
              : mode === "signup"
              ? "By creating an account you agree to our "
              : "We’ll never email your password. The code expires in 15 minutes."}
            {mode === "signup" && (
              <>
                <Link className="text-primary underline" href="/legal/terms">Terms</Link> and{" "}
                <Link className="text-primary underline" href="/legal/privacy">Privacy Policy</Link>. Agent Caller is not
                for payment-card data or regulated health records.
              </>
            )}
          </p>
        </div>
      </div>

      <div
        className="relative hidden min-h-screen overflow-hidden bg-cover bg-center md:block"
        style={{ backgroundImage: `url(${content.image.src})` }}
        key={content.image.src}
        role="img"
        aria-label={content.image.alt}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[#07131c] via-[#07131c]/35 to-[#07131c]/10" />
        <div className="relative z-10 flex h-full min-h-screen flex-col justify-end p-10">
          <span className="eyebrow eyebrow--light">
            <span className="eyebrow__dot" />
            {isSignIn ? "The calls are covered" : "A better first hello"}
          </span>
          <blockquote className="mt-4 max-w-[440px] space-y-3 text-white">
            <p className="font-serif text-3xl leading-tight tracking-tight">
              “<Typewriter key={content.quote.text} text={content.quote.text} speed={38} />”
            </p>
            <cite className="block text-xs not-italic text-white/70">— {content.quote.author}</cite>
          </blockquote>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/20 pt-4 text-[11px] text-white/65">
            <span>14-day trial</span>
            <span>No card to start</span>
            <span>Inbound calls first</span>
            <span>Provider keys encrypted</span>
          </div>
        </div>
      </div>
    </div>
  );
}
