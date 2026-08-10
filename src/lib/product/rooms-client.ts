import { z } from "zod";

/**
 * Talks to the room endpoints from the device.
 *
 * Every failure is returned as a code rather than thrown, because the page has a
 * different sentence for each one — a full room, a finished match, a code that was
 * never live, and a plan without online play are four different things to say.
 */

/*
 * Read schemas are deliberately not `.strict()`. The server may grow additive
 * fields, and a deployed bundle strict-parsing a response it mostly understands
 * would refuse the whole room over a key it could have ignored — a client mid-match
 * during a deploy would read "rooms unavailable" until a reload. Unknown keys are
 * stripped; what is validated is what is used.
 */
const seatSchema = z.object({
  seat: z.number().int(),
  displayName: z.string(),
  isYou: z.boolean(),
  role: z.enum(["owner", "player", "spectator"]),
});

const stateSchema = z.object({
  code: z.string(),
  mode: z.string(),
  options: z.record(z.string(), z.unknown()),
  status: z.enum(["pending", "active", "complete", "abandoned"]),
  version: z.number().int(),
  yourSeat: z.number().int().nullable(),
  // Defaulted rather than required: a server one deploy behind simply has no gallery.
  yourRole: z.enum(["owner", "player", "spectator"]).nullable().default(null),
  watching: z.number().int().min(0).default(0),
  seats: z.array(seatSchema),
  turns: z.array(z.object({}).passthrough()),
});

const seatResultSchema = z.object({ code: z.string(), seat: z.number().int() }).strict();

export type RoomStateView = z.infer<typeof stateSchema>;
export type RoomSeatView = z.infer<typeof seatSchema>;

export type RoomFailure =
  | "upgrade_required"
  | "authentication_required"
  | "room_not_found"
  | "room_full"
  | "gallery_full"
  | "room_closed"
  | "invalid_room_request"
  | "version_conflict"
  | "wrong_seat"
  | "spectator_read_only"
  | "rooms_unavailable";

export type RoomResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: RoomFailure };

const FAILURES: readonly RoomFailure[] = [
  "upgrade_required", "authentication_required", "room_not_found",
  "room_full", "gallery_full", "room_closed", "invalid_room_request",
  "version_conflict", "wrong_seat", "spectator_read_only", "rooms_unavailable",
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

const spectateResultSchema = z.object({ code: z.string(), role: z.enum(["owner", "player", "spectator"]) });

/**
 * Pulls up a chair. The answer names what the caller actually is, because a seated
 * player asking to watch keeps their seat — the room does not demote anybody.
 */
export async function spectateRoom(
  code: string,
  options: RoomClientOptions = {},
): Promise<RoomResult<z.infer<typeof spectateResultSchema>>> {
  return send(spectateResultSchema, `/api/rooms/${encodeURIComponent(code)}`, { spectate: true }, options);
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

const versionSchema = z.object({ version: z.number().int() }).strict();
const completeSchema = z.object({ alreadyComplete: z.boolean() }).strict();

export interface FiledTurn {
  readonly expectedVersion: number;
  readonly seat: number;
  readonly turn: {
    readonly legNumber: number;
    readonly scoreBefore: number;
    readonly scoreAfter: number;
    readonly bust: boolean;
    readonly dartsThrown: 1 | 2 | 3;
    readonly aggregateScore?: number;
    readonly darts: readonly { ordinal: 1 | 2 | 3; segment: number; multiplier: 1 | 2 | 3; x?: number; y?: number }[];
  };
}

/**
 * Files one finished visit. A `version_conflict` is the expected answer when
 * somebody threw while this visit was being entered — it is a race being resolved,
 * not a fault, and the caller catches up rather than retrying blindly.
 */
export async function fileRoomTurn(
  code: string,
  input: FiledTurn,
  options: RoomClientOptions = {},
): Promise<RoomResult<z.infer<typeof versionSchema>>> {
  return send(versionSchema, `/api/rooms/${encodeURIComponent(code)}/turns`, input, options);
}

/** Reports the finish. Both players report it; the second is agreement. */
export async function completeRoomMatch(
  code: string,
  winnerSeat: number | null,
  options: RoomClientOptions = {},
): Promise<RoomResult<z.infer<typeof completeSchema>>> {
  return send(completeSchema, `/api/rooms/${encodeURIComponent(code)}/complete`, { winnerSeat }, options);
}
