"use client";

import Link from "next/link";

import { Pricing, type PricingPlan } from "@/components/ui/pricing";

type PlanSeed = {
  name: string;
  price: string;
  yearlyPrice: string;
  description: string;
  href: string;
  isPopular: boolean;
  homeFeatures: string[];
  fullFeatures: string[];
};

const PLAN_SEEDS: PlanSeed[] = [
  {
    name: "Starter",
    price: "99",
    yearlyPrice: "79",
    description: "For one line and a smaller call volume.",
    href: "/signup?plan=starter",
    isPopular: false,
    homeFeatures: [
      "300 minutes / month",
      "AI receptionist for inbound calls",
      "Lead capture & call summaries",
      "Dashboard, transcript & usage view",
    ],
    fullFeatures: [
      "300 minutes / month · one number",
      "One AI receptionist",
      "Call summaries and lead capture",
      "Dashboard with usage meter",
      "Basic after-hours message taking",
    ],
  },
  {
    name: "Growth",
    price: "199",
    yearlyPrice: "159",
    description: "For a busy team that’s ready to catch more.",
    href: "/signup?plan=growth",
    isPopular: true,
    homeFeatures: [
      "800 minutes / month",
      "AI receptionist for inbound calls",
      "Lead capture & call summaries",
      "Dashboard, transcript & usage view",
    ],
    fullFeatures: [
      "800 minutes / month · up to three numbers",
      "Everything in Starter",
      "Multiple numbers and agents",
      "Provider health and key controls",
      "Team-ready lead workflow",
    ],
  },
  {
    name: "Pro",
    price: "399",
    yearlyPrice: "319",
    description: "For growing teams and multiple lines.",
    href: "/signup?plan=pro",
    isPopular: false,
    homeFeatures: [
      "2,000 minutes / month",
      "AI receptionist for inbound calls",
      "Lead capture & call summaries",
      "Dashboard, transcript & usage view",
    ],
    fullFeatures: [
      "2,000 minutes / month · up to eight numbers",
      "Everything in Growth",
      "Higher included call volume",
      "Priority onboarding workflow",
      "Expanded service configuration",
    ],
  },
];

function toPricingPlans(variant: "home" | "full"): PricingPlan[] {
  return PLAN_SEEDS.map((plan) => ({
    name: plan.name,
    price: plan.price,
    yearlyPrice: plan.yearlyPrice,
    period: "month",
    features: variant === "full" ? plan.fullFeatures : plan.homeFeatures,
    description: plan.description,
    buttonText: "Start a 14-day trial",
    href: plan.href,
    isPopular: plan.isPopular,
  }));
}

export function PricingPlans({ variant = "home" }: { variant?: "home" | "full" }) {
  if (variant === "full") {
    return (
      <Pricing
        plans={toPricingPlans("full")}
        title="Pay for the cover you actually need."
        description="Monthly minutes are included. If you go over, the additional rate is visible up front. There is no unlimited-minute plan."
        footnote={
          <>
            <p>
              Overage: $0.20 per minute. Voice, phone-number, SMS, hosting, and
              third-party provider charges may be separate depending on setup.
              We’ll make the setup clear before you connect a live number.
            </p>
            <Link href="/pricing">Compare all plan details →</Link>
          </>
        }
      />
    );
  }

  return (
    <Pricing
      plans={toPricingPlans("home")}
      title="Plans that scale with your call volume."
      description="Straightforward by design. Every plan includes the inbound receptionist, capture, and dashboard."
      footnote={
        <>
          <p>
            Overage is $0.20 per minute after the included allowance. No
            unlimited-minute plans. Provider and phone charges may vary.
          </p>
          <Link href="/pricing">Compare all plan details →</Link>
        </>
      }
    />
  );
}
