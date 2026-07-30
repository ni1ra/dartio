import { z } from "zod";
import type { MatchRecord } from "@/domain/match-record";

/**
 * Talks to `/api/matches` from the device.
 *
 * Recording is deliberately best-effort. Free play requires no account, so a signed-out
 * player simply has no history to write — a 401 is the expected answer, not a fault, and
 * nothing about a finished match should be interrupted to say so.
 */

const playerSchema = z.object({
  seat: z.number().int(),
  displayName: z.string(),
  isBot: z.boolean(),
  botLevel: z.number().int().nullable(),
  isYou: z.boolean(),
}).strict();

const entrySchema = z.object({
  id: z.string(),
  mode: z.string(),
  completedAt: z.string(),
  players: z.array(playerSchema),
  winnerSeat: z.number().int().nullable(),
  turnCount: z.number().int(),
  dartCount: z.number().int(),
}).strict();

const historySchema = z.object({ matches: z.array(entrySchema) }).strict();

export type MatchHistoryEntryView = z.infer<typeof entrySchema>;

export type RecordMatchOutcome = "recorded" | "signed-out" | "rejected" | "unavailable";

export interface MatchClientOptions {
  readonly signal?: AbortSignal;
  readonly fetcher?: typeof fetch;
}

/**
 * Files a finished match. Returns why it did not land rather than throwing, because
 * every caller's correct response to a failure is the same: nothing.
 */
export async function recordCompletedMatch(
  record: MatchRecord,
  ownerSeat: number,
  options: MatchClientOptions = {},
): Promise<RecordMatchOutcome> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher("/api/matches", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ record, ownerSeat }),
      signal: options.signal,
    });
  } catch {
    return "unavailable";
  }
  if (response.status === 201) return "recorded";
  if (response.status === 401) return "signed-out";
  if (response.status === 400) return "rejected";
  return "unavailable";
}

/** Returns null when history cannot be read, so a surface can say so instead of rendering an empty past. */
export async function fetchMatchHistory(
  options: MatchClientOptions & { readonly limit?: number } = {},
): Promise<readonly MatchHistoryEntryView[] | null> {
  const fetcher = options.fetcher ?? fetch;
  const query = options.limit === undefined ? "" : `?limit=${options.limit}`;
  let response: Response;
  try {
    response = await fetcher(`/api/matches${query}`, { cache: "no-store", signal: options.signal });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const payload: unknown = await response.json().catch(() => null);
  const parsed = historySchema.safeParse(payload);
  return parsed.success ? parsed.data.matches : null;
}
