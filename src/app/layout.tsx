import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://agent-caller.example"),
  title: {
    default: "Agent Caller — A better first hello for every call",
    template: "%s · Agent Caller",
  },
  description: "A friendly AI receptionist that answers inbound calls, captures the details, and gives your service team a clear next step.",
  openGraph: {
    title: "Agent Caller — A better first hello for every call",
    description: "Keep your hands on the work. Agent Caller answers, captures, and hands the lead to your team.",
    type: "website",
    images: ["/images/hero-hvac.jpg"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
