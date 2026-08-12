import { dart, notation, representativePoint, type BoardNumber, type Multiplier } from "./darts";
import type { MatchRecord, RecordedDart } from "./match-record";

/** The owner-visible stored match returned by the replay detail endpoint. */
export interface MatchReplayDetail {
  readonly id: string;
  readonly completedAt: string;
  readonly ownerSeat: number;
  readonly record: MatchRecord;
}

/**
 * A landing the record can actually account for.
 *
 * Exact visits always stored the scoring bed, but older/manual entry may not have
 * stored a physical point. A representative point may place that known bed on the
 * board without pretending it is the measured impact point. Aggregate visits know
 * neither bed nor point and therefore have a separate, marker-free shape.
 */
export type MatchReplayLanding =
  | {
      readonly kind: "dart";
      readonly segment: number;
      readonly multiplier: 1 | 2 | 3;
      readonly notation: string;
      readonly score: number;
      readonly x: number;
      readonly y: number;
      readonly coordinateSource: "recorded" | "representative";
    }
  | {
      readonly kind: "unknown";
      /** The whole visit's typed total, never a score attributed to this dart. */
      readonly visitAggregateScore: number | null;
    };

/** One truthful step in a mode-independent, dart-by-dart replay. */
export interface MatchReplayFrame {
  /** One-based position in the whole match. */
  readonly frameNumber: number;
  readonly seat: number;
  readonly turnNumber: number;
  readonly legNumber: number;
  readonly ordinal: 1 | 2 | 3;
  readonly dartsThrown: 1 | 2 | 3;
  readonly scoreBefore: number;
  /** Unknown until the visit's final frame; no mode-specific arithmetic is invented. */
  readonly scoreAfter: number | null;
  /** Unknown until the visit's final frame for the same reason as `scoreAfter`. */
  readonly bust: boolean | null;
  readonly turnComplete: boolean;
  readonly landing: MatchReplayLanding;
}

/**
 * Rebuilds every stored mode through one ordering and truth path.
 *
 * The server deliberately stores no mode rules. Consequently this function never
 * derives an intermediate score. It exposes the visit's final result only on its
 * last dart and leaves aggregate landings unknown instead of distributing a typed
 * total across imaginary beds.
 */
export function buildMatchReplayTimeline(record: MatchRecord): readonly MatchReplayFrame[] {
  const frames: MatchReplayFrame[] = [];
  const orderedTurns = [...record.turns].sort((left, right) => left.turnNumber - right.turnNumber);

  for (const turn of orderedTurns) {
    const orderedDarts = [...turn.darts].sort((left, right) => left.ordinal - right.ordinal);
    const landings = orderedDarts.length > 0
      ? orderedDarts.map(recordedLanding)
      : Array.from({ length: turn.dartsThrown }, () => ({
          kind: "unknown" as const,
          visitAggregateScore: turn.aggregateScore ?? null,
        }));

    landings.forEach((landing, index) => {
      const turnComplete = index === landings.length - 1;
      frames.push({
        frameNumber: frames.length + 1,
        seat: turn.seat,
        turnNumber: turn.turnNumber,
        legNumber: turn.legNumber,
        ordinal: orderedDarts.length > 0
          ? orderedDarts[index]!.ordinal
          : (index + 1) as 1 | 2 | 3,
        dartsThrown: turn.dartsThrown,
        scoreBefore: turn.scoreBefore,
        scoreAfter: turnComplete ? turn.scoreAfter : null,
        bust: turnComplete ? turn.bust : null,
        turnComplete,
        landing,
      });
    });
  }

  return frames;
}

function recordedLanding(value: RecordedDart): Extract<MatchReplayLanding, { kind: "dart" }> {
  const scoringDart = dart(value.segment as BoardNumber | 0, value.multiplier as Multiplier);
  const hasRecordedPoint = value.x !== undefined && value.y !== undefined;
  const point = hasRecordedPoint ? { x: value.x!, y: value.y! } : representativePoint(scoringDart);
  return {
    kind: "dart",
    segment: value.segment,
    multiplier: value.multiplier,
    notation: notation(scoringDart),
    score: scoringDart.score,
    x: point.x,
    y: point.y,
    coordinateSource: hasRecordedPoint ? "recorded" : "representative",
  };
}
