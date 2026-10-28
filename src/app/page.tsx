import Link from "next/link";
import { HeroIntro } from "@/components/hero-intro";
import { HeroMorphGallery } from "@/components/hero-morph-gallery";
import { PricingPlans } from "@/components/pricing-plans";
import { RoiCalculator } from "@/components/roi-calculator";
import { ServicesScanner } from "@/components/services-scanner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VideoAd } from "@/components/video-ad";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <HeroIntro />
        <HeroMorphGallery />

        <section className="trust-strip shell" aria-label="Platform highlights">
          <span>BUILT FOR THE REAL WORLD</span><i /> <span>INBOUND-FIRST</span><i /> <span>YOUR LEADS, YOUR RULES</span><i /> <span>ALWAYS A HUMAN NEXT STEP</span>
        </section>

        <VideoAd />

        <section className="roi-section">
          <div className="shell roi-section__intro"><div><span className="eyebrow eyebrow--light">A little math, a lot of clarity</span><h2>What could one more<br />answered call be worth?</h2><p>Use your own numbers. Adjust them any time—this is a planning tool, not a forecast.</p></div><div className="roi-stamp"><span>YOUR<br />NUMBERS</span><b>↘</b></div></div>
          <div className="shell"><RoiCalculator /></div>
        </section>

        <ServicesScanner />

        <section className="pricing-block shell" id="plans">
          <PricingPlans />
        </section>

        <section className="final-cta shell"><div className="final-cta__art" aria-hidden="true"><div className="cta-ring cta-ring--one" /><div className="cta-ring cta-ring--two" /><span>⌁</span></div><div className="final-cta__copy"><span className="eyebrow eyebrow--light">Make room for the next call</span><h2>Keep your hands on the work.<br /><em>We’ll be here for the ring.</em></h2><p>Try a 14-day workspace, shape your agent, and see every lead in one place.</p><div className="final-cta__actions"><Link className="button button--light" href="/signup">Start your 14-day trial <span>↗</span></Link><Link className="final-cta__text-link" href="/demo">Listen to the demo <span>→</span></Link></div></div><div className="final-cta__corner">No card required<br />Inbound-first setup</div></section>
      </main>
      <SiteFooter />
    </>
  );
}
