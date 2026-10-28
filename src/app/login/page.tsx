import type { Metadata } from "next";
import { AuthUI } from "@/components/ui/auth-ui";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return <AuthUI initialMode="signin" />;
}
