import type { Metadata } from "next";
import { MatchSetup } from "@/components/match-setup";
export const metadata: Metadata = { title: "Play" };
export default function PlayPage() { return <MatchSetup />; }
