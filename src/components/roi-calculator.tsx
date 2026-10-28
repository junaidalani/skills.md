"use client";

import { useMemo, useState } from "react";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

export function RoiCalculator() {
  const [missedCalls, setMissedCalls] = useState(28);
  const [conversion, setConversion] = useState(35);
  const [jobValue, setJobValue] = useState(650);
  const estimate = useMemo(() => Math.round(missedCalls * conversion / 100 * jobValue), [missedCalls, conversion, jobValue]);
  return (
    <div className="roi-card">
      <div className="roi-card__inputs">
        <label className="range-control"><span>Missed calls each month <strong>{missedCalls}</strong></span><input type="range" min="5" max="100" step="1" value={missedCalls} onChange={(event) => setMissedCalls(Number(event.target.value))} aria-label="Missed calls each month" /></label>
        <label className="range-control"><span>Calls that become jobs <strong>{conversion}%</strong></span><input type="range" min="10" max="80" step="5" value={conversion} onChange={(event) => setConversion(Number(event.target.value))} aria-label="Estimated call to job conversion rate" /></label>
        <label className="range-control"><span>Average job value <strong>{money(jobValue)}</strong></span><input type="range" min="100" max="2500" step="50" value={jobValue} onChange={(event) => setJobValue(Number(event.target.value))} aria-label="Average job value" /></label>
      </div>
      <div className="roi-card__result">
        <span className="eyebrow eyebrow--light">An estimate of work left on the table</span>
        <p className="roi-card__amount">{money(estimate)}<small>/mo</small></p>
        <p>That’s a rough estimate based on the numbers you entered—not a promise of results.</p>
        <div className="roi-card__formula"><span>{missedCalls} calls</span><b>×</b><span>{conversion}% booked</span><b>×</b><span>{money(jobValue)} job</span></div>
      </div>
    </div>
  );
}
