import type { Metadata } from "next";
import { ManagedSignUp } from "@/components/managed-sign-in";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return <ManagedSignUp />;
}
