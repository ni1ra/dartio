import { z } from "zod";

/**
 * Talks to the room endpoints from the device.
 *
 * Every failure is returned as a code rather than thrown, because the page has a
 * different sentence for each one — a full room, a finished match, a code that was
 * never live, and a plan without online play are four different things to say.
 */

const seatSchema = z.object({
  seat: z.number().int(),
  displayName: z.string(),
  isYou: z.boolean(),
  role: z.enum(["owner", "player", "spectator"]),
}).strict();

const stateSchema = z.object({
  code: z.string(),
  mode: z.string(),
  options: z.record(z.string(), z.unknown()),
  status: z.enum(["pending", "active", "complete", "abandoned"]),
  version: z.number().int(),
  yourSeat: z.number().int().nullable(),
  seats: z.array(seatSchema),
  turns: z.array(z.object({}).passthrough()),
}).strict();

const seatResultSchema = z.object({ code: z.string(), seat: z.number().int() }).strict();

export type RoomStateView = z.infer<typeof stateSchema>;
export type RoomSeatView = z.infer<typeof seatSchema>;

export type RoomFailure =
  | "upgrade_required"
  | "authentication_required"
  | "room_not_found"
  | "room_full"
  | "room_closed"
  | "invalid_room_request"
  | "rooms_unavailable";

export type RoomResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: RoomFailure };

const FAILURES: readonly RoomFailure[] = [
  "upgrade_required", "authentication_required", "room_not_found",
  "room_full", "room_closed", "invalid_room_request", "rooms_unavailable",
];

async function readFailure(response: Response): Promise<RoomFailure> {
  const payload: unknown = await response.json().catch(() => null);
  const named = typeof payload === "object" && payload !== null && "error" in payload ? (payload as { error: unknown }).error : null;
  return typeof named === "string" && (FAILURES as readonly string[]).includes(named)
    ? named as RoomFailure
    : "rooms_unavailable";
}

export interface RoomClientOptions {
  readonly signal?: AbortSignal;
  readonly fetcher?: typeof fetch;
}

/** The name on the seat comes from the account, so nothing here sends one. */
export async function createRoom(
  input: { mode: string; options?: Record<string, unknown> },
  options: RoomClientOptions = {},
): Promise<RoomResult<z.infer<typeof seatResultSchema>>> {
  return send(seatResultSchema, "/api/rooms", { ...input, options: input.options ?? {} }, options);
}

export async function joinRoom(
  code: string,
  options: RoomClientOptions = {},
): Promise<RoomResult<z.infer<typeof seatResultSchema>>> {
  return send(seatResultSchema, `/api/rooms/${encodeURIComponent(code)}`, {}, options);
}

export async function readRoom(
  code: string,
  since: number,
  options: RoomClientOptions = {},
): Promise<RoomResult<RoomStateView>> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`/api/rooms/${encodeURIComponent(code)}?since=${since}`, { cache: "no-store", signal: options.signal });
  } catch {
    return { ok: false, failure: "rooms_unavailable" };
  }
  if (!response.ok) return { ok: false, failure: await readFailure(response) };
  const parsed = stateSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, failure: "rooms_unavailable" };
}

async function send<T extends z.ZodType>(
  schema: T,
  url: string,
  body: unknown,
  options: RoomClientOptions,
): Promise<RoomResult<z.infer<T>>> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch {
    return { ok: false, failure: "rooms_unavailable" };
  }
  if (!response.ok) return { ok: false, failure: await readFailure(response) };
  const parsed = schema.safeParse(await response.json().catch(() => null));
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, failure: "rooms_unavailable" };
}
