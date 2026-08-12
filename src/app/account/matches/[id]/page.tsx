import type { Metadata } from "next";
import { MatchReplay } from "@/components/match-replay";

export const metadata: Metadata = { title: "Match replay" };

export default async function MatchReplayPage({ params }: { readonly params: Promise<{ readonly id: string }> }) {
  const { id } = await params;
  return <MatchReplay matchId={id} />;
}
