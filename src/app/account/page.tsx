import type { Metadata } from "next";
import { AccountExperience } from "@/components/account-experience";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return <AccountExperience />;
}
