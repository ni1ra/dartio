import type { Aim, AiTactics } from "./ai";
import { CRICKET_NUMBERS, hasClosed, type CricketNumber, type CricketState } from "./cricket";

/**
 * What a Cricket opponent aims at.
 *
 * The X01 chooser is no use here — it thinks in remaining score, and Cricket has
 * none. The decisions that matter are which number to work and when to stop
 * closing and start scoring, and they are genuinely different at different levels
 * rather than the same choice thrown less accurately.
 *
 * The bull is aimed at as a single, because its treble does not exist and its
 * double is a much smaller target than the outer ring.
 */
function bed(number: CricketNumber): Aim {
  return number === 25 ? { segment: 25, multiplier: 1 } : { segment: number, multiplier: 3 };
}

/** Numbers this player still needs three marks on, highest value first. */
function openFor(state: CricketState, player: number): readonly CricketNumber[] {
  return CRICKET_NUMBERS.filter((number) => !hasClosed(state, player, number));
}

export function chooseCricketAim(state: CricketState, player: number, tactics: AiTactics): Aim {
  const mine = openFor(state, player);

  // A novice works the board in the order it is printed and never thinks about
  // what anybody else has done.
  if (tactics === "novice") return bed(mine[0] ?? 20);

  if (mine.length > 0) {
    // Twenty first is right until it is not: a number every opponent has already
    // closed can never be scored on, so closing it is only defensive. Prefer one
    // that is still worth points to somebody.
    const contested = mine.filter((number) =>
      state.players.some((_, other) => other !== player && !hasClosed(state, other, number)));
    if (tactics === "expert" && contested.length > 0) return bed(contested[0]!);
    return bed(mine[0]!);
  }

  // Everything closed: score on whatever an opponent has not shut yet. In tactics
  // there are no points at all, so there is nothing left to aim at but the twenty.
  if (state.options.variant === "tactics") return bed(20);
  const scoreable = CRICKET_NUMBERS.filter((number) =>
    state.players.some((_, other) => other !== player && !hasClosed(state, other, number)));
  return bed(scoreable[0] ?? 20);
}
