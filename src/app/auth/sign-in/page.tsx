import type { Metadata } from "next";
import { ManagedSignIn } from "@/components/managed-sign-in";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return <ManagedSignIn />;
}
