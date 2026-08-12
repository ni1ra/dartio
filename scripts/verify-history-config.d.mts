export type HistoryConfiguration =
  | { ok: true; origin: string; email: string; password: string }
  | { ok: false; message: string };

export function resolveHistoryConfiguration(
  arguments_: string[],
  environment: Record<string, string | undefined>,
): HistoryConfiguration;

export const HISTORY_REQUEST_TIMEOUT_MS: 40000;

export function secureHistoryRequestInit(init?: RequestInit): RequestInit & {
  redirect: "error";
  signal: AbortSignal;
};
