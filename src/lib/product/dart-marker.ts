import { BOARD_RADII, type Dart } from "@/domain/darts";

export interface DartMarkerProjection {
  readonly x: number;
  readonly y: number;
  readonly offBoard: boolean;
  readonly capped: boolean;
}

/** Keeps even a distant miss visible without changing the dart's scored point. */
export function projectDartMarker(
  value: Pick<Dart, "x" | "y">,
  visibleRimRadius = 1.06,
): DartMarkerProjection {
  const x = value.x ?? 0;
  const y = value.y ?? 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: 0, y: 0, offBoard: true, capped: true };
  }
  const radius = Math.hypot(x, y);
  const offBoard = radius > BOARD_RADII.outer;
  if (radius === 0 || radius <= visibleRimRadius) {
    return { x, y, offBoard, capped: false };
  }
  const scale = visibleRimRadius / radius;
  return { x: x * scale, y: y * scale, offBoard, capped: true };
}
