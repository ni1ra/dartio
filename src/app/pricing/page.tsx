import type { Metadata } from "next";
import { PricingExperience } from "@/components/pricing-experience";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  return <PricingExperience />;
}
