import type { AiTactics } from "./ai";
import type { Aim } from "./ai-throw";
import type { BoardNumber, Dart, Multiplier } from "./darts";
import { liveRoundView, type RoundState } from "./round-modes";

/**
 * What a round-mode opponent aims at.
 *
 * Two of these four modes have exactly one right answer, and this says so rather
 * than inventing variety to look clever. Count-Up scores everything, so the treble
 * twenty is correct at every level; Bob's 27 scores one specific double, so that
 * double is correct at every level. In those two, a stronger opponent is a steadier
 * hand and nothing else, which is the truth about the game and not a shortcut.
 *
 * The other two have real choices:
 *
 * - **Around the Clock** counts any bed on the target, so where you aim inside that
 *   number is a genuine decision. A novice throws at the treble because it looks
 *   like the thing to do; anyone better throws at the big single, which is several
 *   times the area for exactly the same progress.
 * - **Shanghai** pays face value and is won outright by taking the single, the
 *   double and the treble of the round's number in one visit. An expert plays for
 *   that, aiming at whichever of the three it still needs. Anyone else just chases
 *   the treble for points.
 */
function on(target: number, multiplier: Multiplier): Aim {
  return { segment: target as BoardNumber, multiplier };
}

export function chooseRoundAim(
  state: RoundState,
  player: number,
  tactics: AiTactics,
  thrownThisVisit: readonly Dart[] = state.currentDarts,
): Aim {
  // Around the Clock advances inside a visit. The live projection, unlike the
  // banked round target, therefore moves 1 → 2 → 3 as exact hits arrive.
  const target = liveRoundView(state).target;

  if (state.mode === "countUp" || target === null) return { segment: 20, multiplier: 3 };
  // The bull has no treble, so the outer bull is the aim whatever the level.
  if (target === 25) return { segment: 25, multiplier: 1 };

  if (state.mode === "bobs27") return on(target, 2);

  if (state.mode === "aroundTheClock") {
    return on(target, tactics === "novice" ? 3 : 1);
  }

  // Shanghai.
  if (tactics !== "expert") return on(target, 3);
  const taken = new Set(thrownThisVisit.filter((value) => value.segment === target).map((value) => value.multiplier));
  // Hardest first while there are darts to spare: the treble is the one most
  // likely to need a second attempt.
  for (const multiplier of [3, 2, 1] as const) {
    if (!taken.has(multiplier)) return on(target, multiplier);
  }
  return on(target, 3);
}
