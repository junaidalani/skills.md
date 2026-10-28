"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import NumberFlow from "@number-flow/react";
import { motion } from "framer-motion";
import { Check, Star } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

export interface PricingPlan {
  name: string;
  price: string;
  yearlyPrice: string;
  period: string;
  features: string[];
  description: string;
  buttonText: string;
  href: string;
  isPopular: boolean;
}

interface PricingProps {
  plans: PricingPlan[];
  title?: string;
  description?: string;
  footnote?: ReactNode;
}

export function Pricing({
  plans,
  title = "Simple, transparent pricing",
  description = "Choose the plan that works for you.",
  footnote,
}: PricingProps) {
  const [isMonthly, setIsMonthly] = useState(true);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const switchRef = useRef<HTMLButtonElement>(null);

  const handleToggle = (checked: boolean) => {
    setIsMonthly(!checked);
    if (checked && switchRef.current) {
      const rect = switchRef.current.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      confetti({
        particleCount: 50,
        spread: 60,
        origin: {
          x: x / window.innerWidth,
          y: y / window.innerHeight,
        },
        colors: ["#245565", "#3c7f8f", "#c39355", "#c8e2e2"],
        ticks: 200,
        gravity: 1.2,
        decay: 0.94,
        startVelocity: 30,
        shapes: ["circle"],
      });
    }
  };

  return (
    <div className="pricing-ui">
      <div className="pricing-ui__heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      <div className="pricing-ui__toggle">
        <Label htmlFor="billing-toggle" className="pricing-ui__toggle-label">
          <Switch
            id="billing-toggle"
            ref={switchRef}
            checked={!isMonthly}
            onCheckedChange={handleToggle}
          />
        </Label>
        <span>
          Annual billing <em>(Save 20%)</em>
        </span>
      </div>

      <div className="pricing-ui__grid">
        {plans.map((plan, index) => (
          <motion.div
            key={plan.name}
            initial={{ y: 50, opacity: 1 }}
            whileInView={
              isDesktop
                ? {
                    y: plan.isPopular ? -20 : 0,
                    opacity: 1,
                    x: index === 2 ? -30 : index === 0 ? 30 : 0,
                    scale: index === 0 || index === 2 ? 0.94 : 1.0,
                  }
                : {}
            }
            viewport={{ once: true }}
            transition={{
              duration: 1.2,
              type: "spring",
              stiffness: 100,
              damping: 30,
              delay: 0.15,
              opacity: { duration: 0.5 },
            }}
            className={cn(
              "pricing-ui__card",
              plan.isPopular ? "pricing-ui__card--popular" : "pricing-ui__card--side",
            )}
          >
            {plan.isPopular && (
              <div className="pricing-ui__badge">
                <Star aria-hidden="true" />
                <span>Popular</span>
              </div>
            )}
            <div className="pricing-ui__body">
              <p className="pricing-ui__name">{plan.name}</p>
              <div className="pricing-ui__price">
                <span>
                  <NumberFlow
                    value={isMonthly ? Number(plan.price) : Number(plan.yearlyPrice)}
                    format={{
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    }}
                    transformTiming={{ duration: 500, easing: "ease-out" }}
                  />
                </span>
                <span className="pricing-ui__period">/ {plan.period}</span>
              </div>
              <p className="pricing-ui__billed">
                {isMonthly ? "billed monthly" : "billed annually"}
              </p>

              <ul className="pricing-ui__features">
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <hr />

              <Link
                href={plan.href}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "pricing-ui__button",
                  plan.isPopular && "pricing-ui__button--popular",
                )}
              >
                {plan.buttonText}
              </Link>
              <p className="pricing-ui__description">{plan.description}</p>
            </div>
          </motion.div>
        ))}
      </div>
      {footnote && <div className="pricing-ui__footnote">{footnote}</div>}
    </div>
  );
}
