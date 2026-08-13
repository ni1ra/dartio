import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CricketMatch } from "@/components/cricket-match";
import { CustomPracticeMatch } from "@/components/custom-practice-match";
import { DrillMatch } from "@/components/drill-match";
import { DRILLS, encodeCustomPracticePath, parseCustomPracticePath, type DrillId } from "@/domain";
import { RoomMatch } from "@/components/room-match";
import { RoundMatch } from "@/components/round-match";
import { ROUND_MODES, type RoundModeId } from "@/domain";
import { X01Match } from "@/components/x01-match";

export const metadata: Metadata = { title: "Live match" };

/**
 * One route, one mode per render. A mode brings its own component, its own
 * rules, and its own log; nothing here knows what any of them contain beyond
 * which one was asked for.
 */
export default async function MatchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // A room decides its own mode and rules, so the code wins over anything else in
  // the query: the room is the record, not the link that reached it.
  const room = params.room;
  if (typeof room === "string" && /^[A-Za-z0-9]{6}$/.test(room)) return <RoomMatch code={room.toUpperCase()} />;
  const custom = params.custom;
  if (custom !== undefined) {
    if (typeof custom !== "string") notFound();
    const targets = parseCustomPracticePath(custom);
    if (!targets) notFound();
    return <CustomPracticeMatch key={encodeCustomPracticePath(targets)} targets={targets} />;
  }
  const drill = params.drill;
  if (typeof drill === "string" && drill in DRILLS) return <DrillMatch drill={drill as DrillId} />;
  const mode = params.mode;
  if (mode === "cricket") return <CricketMatch />;
  if (typeof mode === "string" && mode in ROUND_MODES) return <RoundMatch mode={mode as RoundModeId} />;
  return <X01Match />;
}
