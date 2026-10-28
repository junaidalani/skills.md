import type { Metadata } from "next";
import Link from "next/link";
import { PricingPlans } from "@/components/pricing-plans";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Pricing", description: "Simple monthly plans for inbound AI call answering." };

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="page-hero">
          <div className="shell page-hero__inner">
            <span className="eyebrow">Simple plans. Clear limits.</span>
            <h1>Pay for the cover<br /><em>you actually need.</em></h1>
            <p>Monthly minutes are included. If you go over, the additional rate is visible up front. There is no unlimited-minute plan.</p>
          </div>
        </section>

        <section className="content-section shell">
          <PricingPlans variant="full" />
        </section>

        <section className="content-section" style={{ background: "#eaf1f2" }}>
          <div className="shell industry-detail">
            <div>
              <span className="eyebrow">Usage you can see</span>
              <h2>No “unlimited” surprises.</h2>
              <p>Your dashboard tracks monthly minutes against the allowance on your plan. A call is rounded up in the usage meter; final billing terms depend on your account agreement and provider setup.</p>
            </div>
            <div>
              <span className="eyebrow">Illustrative only</span>
              <h2>Plan for the call volume you need.</h2>
              <p>Provider costs and telephony rates change. Review vendor pricing and commercial terms before selecting a stack. The prices shown here are example platform plans and are not a guarantee of margin.</p>
              <Link className="text-link" href="/security">Read provider and security notes <span>→</span></Link>
            </div>
          </div>
        </section>

        <section className="content-section shell content-narrow">
          <h2>What happens after a trial?</h2>
          <p>Choose a plan and connect Stripe when billing is enabled for your workspace. A real subscription is not created until the account owner completes Stripe Checkout. You can review the current usage and plan in the dashboard.</p>
          <Link className="button button--dark" href="/signup">Set up your workspace <span>↗</span></Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
