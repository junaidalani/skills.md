"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const signup = mode === "signup";
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const selectedPlan = signup ? new URLSearchParams(window.location.search).get("plan") || "starter" : undefined;
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, businessName, email, password, planId: selectedPlan }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Something went wrong. Please try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("We couldn’t reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Link className="brand brand--light" href="/"><span className="brand__mark" aria-hidden="true"><span /><span /><span /></span><span>agent caller</span></Link>
        <div className="auth-aside__copy"><span className="eyebrow eyebrow--light">For the people who keep things running</span><h1>Be present for the work. We’ll be present for the ring.</h1><p>One calm first response for every inbound call. Your agent captures the details and puts the next step back in your hands.</p></div>
        <div className="auth-aside__footer">INBOUND-FIRST · TRANSPARENT USAGE · BUILT FOR SMALL TEAMS</div>
        <div className="auth-aside__shape" aria-hidden="true" />
      </aside>
      <main className="auth-main">
        <div className="auth-form">
          <div className="auth-form__top"><Link className="brand" href="/"><span className="brand__mark" aria-hidden="true"><span /><span /><span /></span><span>agent caller</span></Link><Link href={signup ? "/login" : "/signup"}>{signup ? "Already have an account? Log in" : "New to Agent Caller? Start a trial"}</Link></div>
          <h2>{signup ? "Make room for the next call." : "Welcome back."}</h2>
          <p className="auth-form__intro">{signup ? "Create your workspace. Your 14-day trial starts with a simple setup." : "Sign in to see your calls, leads, and agent settings."}</p>
          <form onSubmit={submit}>
            {signup && <>
              <div className="field"><label htmlFor="auth-name">Your name</label><input id="auth-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Taylor Morgan" required maxLength={100} /></div>
              <div className="field"><label htmlFor="auth-business">Business name</label><input id="auth-business" autoComplete="organization" value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Northstar Heating & Air" required maxLength={120} /></div>
            </>}
            <div className="field"><label htmlFor="auth-email">Work email</label><input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@yourbusiness.com" required maxLength={254} /></div>
            <div className="field"><label htmlFor="auth-password">Password</label><input id="auth-password" type="password" autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={signup ? "At least 8 characters" : "Your password"} minLength={8} required maxLength={128} /><small className="field-hint">{signup ? "Use at least 8 characters. Keep provider keys separate from your password." : "Your password is never shared with your voice providers."}</small></div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button--dark" type="submit" disabled={busy}>{busy ? "One moment…" : signup ? "Create my workspace" : "Sign in"}<span aria-hidden="true">→</span></button>
          </form>
          {signup && <p className="auth-form__legal">By creating an account, you agree to our <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy Policy</Link>. Agent Caller is not for payment-card data or regulated health records.</p>}
        </div>
      </main>
    </div>
  );
}
