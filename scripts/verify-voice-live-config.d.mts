export type LiveVoiceConfiguration =
  | { ok: true; origin: string; email: string; password: string }
  | { ok: false; message: string };

export function resolveLiveVoiceConfiguration(
  arguments_: string[],
  environment: Record<string, string | undefined>,
): LiveVoiceConfiguration;

export function hasPrivateNoStore(value: string | null | undefined): boolean;
export function isExpectedTrebleTwentyVoiceSuccess(payload: unknown): boolean;
export function classifyTrebleTwentyVoiceSuccess(payload: unknown): "expected" | "unexpected" | "malformed";
