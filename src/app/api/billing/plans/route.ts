import { NextResponse } from "next/server";

const plans = [
  { id: "starter", name: "Starter", price: 99, includedMinutes: 300, overage: 0.2, maximumNumbers: 1, audience: "A calmer way to cover the essentials" },
  { id: "growth", name: "Growth", price: 199, includedMinutes: 800, overage: 0.2, maximumNumbers: 3, audience: "For busy teams ready to catch every lead", popular: true },
  { id: "pro", name: "Pro", price: 399, includedMinutes: 2000, overage: 0.2, maximumNumbers: 8, audience: "More coverage for growing operations" },
];

export async function GET() {
  return NextResponse.json({ plans, billingConfigured: Boolean(process.env.STRIPE_SECRET_KEY) });
}
