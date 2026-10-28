import type { Metadata } from "next";
import { AuthUI } from "@/components/ui/auth-ui";

export const metadata: Metadata = { title: "Start your trial" };

export default function SignupPage() {
  return <AuthUI initialMode="signup" />;
}
