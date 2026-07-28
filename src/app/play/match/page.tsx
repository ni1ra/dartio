import type { Metadata } from "next";
import { CricketMatch } from "@/components/cricket-match";
import { X01Match } from "@/components/x01-match";

export const metadata: Metadata = { title: "Live match" };

/**
 * One route, one mode per render. A mode brings its own component, its own
 * rules, and its own log; nothing here knows what any of them contain beyond
 * which one was asked for.
 */
export default async function MatchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const mode = (await searchParams).mode;
  return mode === "cricket" ? <CricketMatch /> : <X01Match />;
}
