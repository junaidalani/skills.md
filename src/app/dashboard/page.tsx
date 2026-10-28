import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Workspace dashboard", robots: { index: false, follow: false } };

export default function DashboardPage() {
  return <DashboardShell />;
}
