"use client";

import { dart, representativePoint } from "@/domain";
import { Dartboard } from "./dartboard";

/**
 * The landing page's board, rendered by the real thing.
 *
 * It used to be a `repeating-conic-gradient` faking a dartboard, which is why
 * it read as wrong: twenty wedges of the same width with no doubles ring, no
 * trebles ring, no numbers, and darts positioned as absolute percentages that
 * drifted with the container. Reusing the regulation renderer means the first
 * board a visitor sees is the board they will score on — same geometry, same
 * proportions, same wire positions — and it can never drift out of sync with it.
 *
 * Decorative: no handler, not focusable, and hidden from assistive technology,
 * because the interactive board is one click away on /play.
 */
const VISIT = [dart(20, 3), dart(20, 1), dart(5, 3)] as const;

export function HeroBoard() {
  // Placed at each bed's representative point, so the darts sit where those
  // scores actually land rather than at hand-tuned percentages.
  const darts = VISIT.map((value) => dart(value.segment, value.multiplier, representativePoint(value)));

  return (
    <div className="hero-board-shell" aria-hidden="true">
      <Dartboard darts={darts} disabled onDart={() => {}} caption="" hint="" />
    </div>
  );
}
