export type LiveAiConfiguration =
  | { ok: true; origin: string; email: string; password: string }
  | { ok: false; message: string };

export interface VerifiedLiveDart {
  readonly segment: number;
  readonly multiplier: number;
  readonly score: number;
  readonly x: number;
  readonly y: number;
}

export interface VerifiedLiveAim {
  readonly segment: number;
  readonly multiplier: number;
}

export function resolveLiveAiConfiguration(
  arguments_: string[],
  environment: Record<string, string | undefined>,
): LiveAiConfiguration;

export function hasPrivateNoStore(value: string | null | undefined): boolean;
export function parsePhysicallyConsistentDart(payload: unknown): VerifiedLiveDart | null;
export const LIVE_AI_SAMPLE_SIZE: number;
export function isPlausiblyAimedSample(
  darts: readonly VerifiedLiveDart[],
  target: VerifiedLiveAim,
): boolean;
