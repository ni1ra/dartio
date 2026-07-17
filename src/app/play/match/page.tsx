import type { Metadata } from "next";
import { X01Match } from "@/components/x01-match";
export const metadata: Metadata = { title: "Live X01 match" };
export default function MatchPage() { return <X01Match />; }
