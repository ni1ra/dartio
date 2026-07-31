import type { RecordedDart } from "@/domain/match-record";

/**
 * The row a thrown dart becomes.
 *
 * Written in two places — history and rooms — and both had their own copy of the
 * microunit conversion. A landing point is stored as an integer so it survives the
 * round trip: as a float, 0.1 comes back as 0.09999999999999998, and two copies of
 * that reasoning is one chance for them to drift into storing different things.
 */
export interface DartRow {
  readonly turnId: string;
  readonly ordinal: number;
  readonly segment: number;
  readonly multiplier: number;
  readonly x: number | null;
  readonly y: number | null;
}

const MICROUNITS = 1_000_000;

export function dartRows(turnId: string, darts: readonly RecordedDart[]): readonly DartRow[] {
  return darts.map((thrown) => ({
    turnId,
    ordinal: thrown.ordinal,
    segment: thrown.segment,
    multiplier: thrown.multiplier,
    x: thrown.x === undefined ? null : Math.round(thrown.x * MICROUNITS),
    y: thrown.y === undefined ? null : Math.round(thrown.y * MICROUNITS),
  }));
}
