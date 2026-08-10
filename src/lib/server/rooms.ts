import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { createDatabase } from "@/db/client";
import { dartRows } from "@/db/rows";
import { darts, matches, players, roomMembers, rooms, turns } from "@/db/schema";
import type { RecordedTurn } from "@/domain/match-record";
import type { Database } from "./match-history";
import { record, recordFailure } from "./observability";
import { isUniqueViolation } from "@/db/errors";

export type { Database };

/**
 * Rooms: one shared, ordered record of a match two people are playing apart.
 *
 * What the server is authoritative over is deliberate and narrow:
 *
 *   1. **Membership.** Only a member writes, and only into their own seat.
 *   2. **Ordering.** The turn number is assigned here, never sent by a client.
 *   3. **Mutual exclusion.** Every write carries the version it believes it is
 *      extending. A stale version is refused, so two phones cannot both file
 *      "turn 14" and quietly overwrite one another.
 *
 * What it is *not* is a referee. It does not check that a visit was legal, because
 * that needs the mode's rules, and keeping those off the server is what lets a
 * seventh mode ship without touching it. Nor could it usefully guess whose turn it
 * is: X01 rotates its leg starter, so "seat = turn number modulo players" is wrong
 * the moment a leg ends. The claim on `/friends` says exactly this much and no more.
 */

/** No O/0 or I/1: a code is read aloud across a room or typed off a screenshot. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_SEATS = 8;
/**
 * Spectators are members without seats, so the seat cap does not bound them; this
 * does. The number is generous on purpose — a gallery is company, not a resource —
 * but it exists so one room cannot accrete unbounded membership rows.
 */
const MAX_SPECTATORS = 16;
/** A room is a sitting, not an account. Abandoned ones stop being joinable. */
const ROOM_TTL_HOURS = 12;

export interface RoomSeat {
  readonly seat: number;
  readonly displayName: string;
  readonly isYou: boolean;
  readonly role: "owner" | "player" | "spectator";
}

export interface RoomState {
  readonly code: string;
  readonly mode: string;
  readonly options: Record<string, unknown>;
  readonly status: "pending" | "active" | "complete" | "abandoned";
  /** Increments once per accepted write. A client sends back the last one it saw. */
  readonly version: number;
  readonly yourSeat: number | null;
  /**
   * The caller's standing in the room: a seat's role, `spectator` for a member
   * without a seat, `null` for an entitled stranger reading by code. `yourSeat`
   * answers "where do I throw from"; this answers "what am I here as".
   */
  readonly yourRole: RoomSeat["role"] | null;
  /** How many are watching. Spectators are counted, not named — a gallery, not a roster. */
  readonly watching: number;
  readonly seats: readonly RoomSeat[];
  readonly turns: readonly RoomTurn[];
}

export interface RoomTurn extends RecordedTurn {
  readonly version: number;
}

export class RoomError extends Error {
  constructor(readonly status: 403 | 404 | 409 | 422, readonly code: string, message: string) {
    super(message);
    this.name = "RoomError";
  }
}

export class RoomServiceError extends Error {
  readonly status = 503;
  constructor(options?: ErrorOptions) {
    super("Rooms are unavailable", options);
    this.name = "RoomServiceError";
  }
}

export function generateRoomCode(random: () => number = Math.random): string {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)] ?? "A";
  }
  return code;
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase();
}

export interface CreateRoomInput {
  readonly mode: string;
  readonly options: Record<string, unknown>;
  readonly displayName: string;
}

export interface RoomSeatResult {
  readonly code: string;
  readonly seat: number;
}

export interface RoomSpectateResult {
  readonly code: string;
  /** What the caller actually is — a player asking to watch keeps their seat. */
  readonly role: RoomSeat["role"];
}

/**
 * Opens a room and seats its owner.
 *
 * The code is generated here and retried on collision rather than derived from the
 * room id: six readable characters are what somebody reads down a phone, and the
 * unique index on `rooms.code` is what makes the retry safe rather than hopeful.
 */
export async function createRoom(
  userId: string,
  input: CreateRoomInput,
  db: Database = createDatabase(),
  random: () => number = Math.random,
): Promise<RoomSeatResult> {
  const roomId = randomUUID();
  const matchId = randomUUID();
  const playerId = randomUUID();
  const expiresAt = new Date(Date.now() + ROOM_TTL_HOURS * 3_600_000);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateRoomCode(random);
    try {
      await db.batch([
        db.insert(rooms).values({ id: roomId, code, ownerUserId: userId, settings: { mode: input.mode, options: input.options }, expiresAt }),
        db.insert(roomMembers).values({ roomId, userId, role: "owner" }),
        db.insert(matches).values({ id: matchId, roomId, mode: input.mode, status: "pending", options: input.options }),
        db.insert(players).values({ id: playerId, matchId, userId, seat: 0, displayName: input.displayName, isBot: false }),
      ] as never);
      record("room.opened", { userId, mode: input.mode });
      return { code, seat: 0 };
    } catch (cause) {
      // 23505 is a duplicate code and only a duplicate code: every other id here
      // was generated in this call and cannot already exist.
      if (!isUniqueViolation(cause) || attempt === 4) throw new RoomServiceError({ cause });
    }
  }
  throw new RoomServiceError();
}

/** Takes the next free seat in a room, or returns the seat already held. */
export async function joinRoom(
  userId: string,
  code: string,
  displayName: string,
  db: Database = createDatabase(),
): Promise<RoomSeatResult> {
  const room = await findRoom(normalizeRoomCode(code), db);
  const seated = room.seats.find((seat) => seat.userId === userId);
  if (seated) return { code: room.code, seat: seated.seat };
  if (room.seats.length >= MAX_SEATS) throw new RoomError(409, "room_full", "This room has no free seat");
  if (room.status === "complete" || room.status === "abandoned") {
    throw new RoomError(409, "room_closed", "This room's match has already finished");
  }

  const seat = nextFreeSeat(room.seats.map((entry) => entry.seat));
  const member = room.members.find((entry) => entry.userId === userId);
  try {
    await db.batch([
      // A spectator taking a seat is promoted, not re-inserted — inserting would
      // trip the membership primary key and read as somebody else's seat race.
      // The role guard keeps the promotion from ever rewriting an owner.
      member
        ? db.update(roomMembers).set({ role: "player" })
            .where(and(eq(roomMembers.roomId, room.roomId), eq(roomMembers.userId, userId), eq(roomMembers.role, "spectator")))
        : db.insert(roomMembers).values({ roomId: room.roomId, userId, role: "player" }),
      db.insert(players).values({ id: randomUUID(), matchId: room.matchId, userId, seat, displayName, isBot: false }),
      // A room with a second player is a match in progress, not one waiting to start.
      db.update(matches).set({ status: "active" }).where(eq(matches.id, room.matchId)),
    ] as never);
  } catch (cause) {
    if (isUniqueViolation(cause)) throw new RoomError(409, "seat_taken", "Somebody took that seat first");
    throw new RoomServiceError({ cause });
  }
  return { code: room.code, seat };
}

/**
 * Joins a room as a watcher: a membership row and nothing else.
 *
 * No seat means no `players` row, which is what makes the read-only promise
 * structural rather than policed — a spectator cannot file a visit for the same
 * reason a stranger cannot, and never appears in anyone's match history or the
 * statistics computed from it. Spectators are counted, not named: the players'
 * names are on the seats, and a gallery is company rather than a roster.
 */
export async function spectateRoom(
  userId: string,
  code: string,
  db: Database = createDatabase(),
): Promise<RoomSpectateResult> {
  const room = await findRoom(normalizeRoomCode(code), db);
  // A seat outranks the gallery: a player asking to watch keeps what they hold.
  const seated = room.seats.find((seat) => seat.userId === userId);
  if (seated) return { code: room.code, role: seated.role };
  const member = room.members.find((entry) => entry.userId === userId);
  if (member) return { code: room.code, role: member.role };
  if (room.status === "complete" || room.status === "abandoned") {
    throw new RoomError(409, "room_closed", "This room's match has already finished");
  }
  if (room.members.filter((entry) => entry.role === "spectator").length >= MAX_SPECTATORS) {
    throw new RoomError(409, "gallery_full", "This room's gallery is full");
  }

  try {
    await db.insert(roomMembers).values({ roomId: room.roomId, userId, role: "spectator" });
  } catch (cause) {
    // Two taps racing each other both wanted the same thing, and one of them got it.
    if (isUniqueViolation(cause)) return { code: room.code, role: "spectator" };
    throw new RoomServiceError({ cause });
  }
  record("room.spectated", { userId });
  return { code: room.code, role: "spectator" };
}

export interface AppendTurnInput {
  /** The version the writer believes it is extending. */
  readonly expectedVersion: number;
  readonly seat: number;
  readonly turn: Omit<RecordedTurn, "turnNumber" | "seat">;
}

/**
 * Appends one visit to the shared record.
 *
 * The version check and the insert are the same statement: `set state_version =
 * state_version + 1 where state_version = expected` either matches one row or none,
 * and Postgres decides which under its own lock. Checking first and writing second
 * would leave exactly the gap this is meant to close.
 */
export async function appendRoomTurn(
  userId: string,
  code: string,
  input: AppendTurnInput,
  db: Database = createDatabase(),
): Promise<{ readonly version: number }> {
  const room = await findRoom(normalizeRoomCode(code), db);
  const seated = room.seats.find((seat) => seat.userId === userId);
  if (!seated) throw refusalForUnseated(room, userId);
  if (seated.seat !== input.seat) throw new RoomError(403, "wrong_seat", "You can only throw from your own seat");
  if (room.status === "complete" || room.status === "abandoned") {
    throw new RoomError(409, "room_closed", "This room's match has already finished");
  }

  let claimed: { version: number } | undefined;
  try {
    // The SET target is written unqualified on purpose. Drizzle renders a column
    // reference as "matches"."state_version", which Postgres accepts everywhere in
    // this statement except as the thing being assigned — there it is a syntax
    // error, and the whole write came back 503 until the target was spelled out.
    const result = await db.execute<{ version: number }>(sql`
      update ${matches}
         set state_version = ${matches.stateVersion} + 1
       where ${matches.id} = ${room.matchId}
         and ${matches.stateVersion} = ${input.expectedVersion}
      returning ${matches.stateVersion} as "version"
    `);
    claimed = result.rows[0];
  } catch (cause) {
    throw new RoomServiceError({ cause });
  }
  if (!claimed) {
    // Worth counting rather than only refusing: a room producing these steadily
    // means two clients disagree about whose turn it is, not that people are fast.
    record("room.version_conflict", { userId, count: input.expectedVersion }, "warn");
    throw new RoomError(409, "version_conflict", "Somebody else threw first — catch up and try again");
  }

  // The version is now this turn's number: both count accepted writes, and the
  // update above is the only thing that increments either.
  const turnNumber = claimed.version;
  const turnId = randomUUID();
  try {
    const statements = [
      db.insert(turns).values({
        id: turnId,
        matchId: room.matchId,
        playerId: seated.playerId,
        turnNumber,
        legNumber: input.turn.legNumber,
        scoreBefore: input.turn.scoreBefore,
        scoreAfter: input.turn.scoreAfter,
        bust: input.turn.bust,
        dartsThrown: input.turn.dartsThrown,
        aggregateScore: input.turn.aggregateScore ?? null,
      }),
      ...(input.turn.darts.length > 0 ? [db.insert(darts).values([...dartRows(turnId, input.turn.darts)])] : []),
    ];
    await db.batch(statements as never);
  } catch (cause) {
    recordFailure("room.turn_failed", cause, { userId, count: turnNumber });
    throw new RoomServiceError({ cause });
  }
  return { version: claimed.version };
}

/**
 * Closes a room's match and names its winner.
 *
 * Two things make this deliberately unlike `appendRoomTurn`.
 *
 * It does **not** touch `state_version`. That counter is also the turn number —
 * every accepted visit increments it and takes its value — so incrementing without
 * appending a visit would desync the two and hand the next turn a number that skips
 * one.
 *
 * And it is idempotent. Both players replay the same log and both see the same
 * finish, so both will report it; the second report is agreement, not a conflict.
 */
export async function completeRoomMatch(
  userId: string,
  code: string,
  winnerSeat: number | null,
  db: Database = createDatabase(),
): Promise<{ readonly alreadyComplete: boolean }> {
  const room = await findRoom(normalizeRoomCode(code), db);
  const seated = room.seats.find((seat) => seat.userId === userId);
  if (!seated) throw refusalForUnseated(room, userId);
  if (room.status === "complete") return { alreadyComplete: true };

  const winner = winnerSeat === null ? null : room.seats.find((seat) => seat.seat === winnerSeat);
  if (winnerSeat !== null && !winner) {
    throw new RoomError(422, "unknown_seat", "That seat is not in this room");
  }

  try {
    await db.update(matches)
      .set({ status: "complete", winnerPlayerId: winner?.playerId ?? null, completedAt: new Date() })
      .where(eq(matches.id, room.matchId));
  } catch (cause) {
    throw new RoomServiceError({ cause });
  }
  return { alreadyComplete: false };
}

/** The room as it stands, with only the visits the caller has not already seen. */
export async function readRoom(
  userId: string | null,
  code: string,
  since: number,
  db: Database = createDatabase(),
): Promise<RoomState> {
  const room = await findRoom(normalizeRoomCode(code), db);
  let rows: { turnNumber: number; seat: number; legNumber: number; scoreBefore: number; scoreAfter: number; bust: boolean; dartsThrown: number; aggregateScore: number | null; darts: readonly { ordinal: number; segment: number; multiplier: number }[] }[];
  try {
    const result = await db.execute<(typeof rows)[number]>(sql`
      select
        ${turns.turnNumber} as "turnNumber",
        ${players.seat} as "seat",
        ${turns.legNumber} as "legNumber",
        ${turns.scoreBefore} as "scoreBefore",
        ${turns.scoreAfter} as "scoreAfter",
        ${turns.bust} as "bust",
        ${turns.dartsThrown} as "dartsThrown",
        ${turns.aggregateScore} as "aggregateScore",
        coalesce(
          json_agg(json_build_object('ordinal', ${darts.ordinal}, 'segment', ${darts.segment}, 'multiplier', ${darts.multiplier}) order by ${darts.ordinal})
            filter (where ${darts.id} is not null),
          '[]'::json
        ) as "darts"
      from ${turns}
      join ${players} on ${players.id} = ${turns.playerId}
      left join ${darts} on ${darts.turnId} = ${turns.id}
      where ${turns.matchId} = ${room.matchId} and ${turns.turnNumber} > ${since}
      group by ${turns.id}, ${players.seat}, ${turns.turnNumber}
      order by ${turns.turnNumber}
    `);
    rows = [...result.rows];
  } catch (cause) {
    throw new RoomServiceError({ cause });
  }

  const yourSeat = room.seats.find((seat) => seat.userId === userId);
  return {
    code: room.code,
    mode: room.mode,
    options: room.options,
    status: room.status,
    version: room.version,
    yourSeat: yourSeat?.seat ?? null,
    // A seat's role wins over the membership row: promotion updates both, but the
    // seat is the thing the rest of the room can see.
    yourRole: yourSeat?.role ?? room.members.find((entry) => entry.userId === userId)?.role ?? null,
    watching: room.members.filter((entry) => entry.role === "spectator").length,
    seats: room.seats.map((seat) => ({
      seat: seat.seat,
      displayName: seat.displayName,
      isYou: userId !== null && seat.userId === userId,
      role: seat.role,
    })),
    turns: rows.map((row) => ({
      version: row.turnNumber,
      turnNumber: row.turnNumber,
      seat: row.seat,
      legNumber: row.legNumber,
      scoreBefore: row.scoreBefore,
      scoreAfter: row.scoreAfter,
      bust: row.bust,
      dartsThrown: row.dartsThrown as 1 | 2 | 3,
      ...(row.aggregateScore === null ? {} : { aggregateScore: row.aggregateScore }),
      darts: row.darts.map((thrown) => ({ ordinal: thrown.ordinal as 1 | 2 | 3, segment: thrown.segment, multiplier: thrown.multiplier as 1 | 2 | 3 })),
    })),
  };
}

interface FoundRoom {
  readonly roomId: string;
  readonly matchId: string;
  readonly code: string;
  readonly mode: string;
  readonly options: Record<string, unknown>;
  readonly status: RoomState["status"];
  readonly version: number;
  readonly seats: readonly { seat: number; userId: string | null; displayName: string; playerId: string; role: RoomSeat["role"] }[];
  /**
   * Every membership row, seated or not. `seats` reaches membership through
   * `players`, so a spectator — a member with no seat — is invisible there;
   * this is where the room knows who is watching and who may not throw.
   */
  readonly members: readonly { userId: string; role: RoomSeat["role"] }[];
}

async function findRoom(code: string, db: Database): Promise<FoundRoom> {
  let rows: (Omit<FoundRoom, "seats" | "members"> & { seats: FoundRoom["seats"]; members: FoundRoom["members"] })[];
  try {
    const result = await db.execute<(typeof rows)[number]>(sql`
      select
        ${rooms.id} as "roomId",
        ${matches.id} as "matchId",
        ${rooms.code} as "code",
        ${matches.mode} as "mode",
        ${matches.options} as "options",
        ${matches.status} as "status",
        ${matches.stateVersion} as "version",
        coalesce(
          json_agg(json_build_object(
            'seat', ${players.seat},
            'userId', ${players.userId},
            'displayName', ${players.displayName},
            'playerId', ${players.id},
            'role', coalesce(${roomMembers.role}, 'player')
          ) order by ${players.seat}) filter (where ${players.id} is not null),
          '[]'::json
        ) as "seats",
        (
          -- A scalar subquery rather than a second join: two aggregates over two
          -- joins would multiply rows. Inside this scope "room_members" is the
          -- subquery's own instance, not the joined one above.
          select coalesce(
            json_agg(json_build_object('userId', ${roomMembers.userId}, 'role', ${roomMembers.role})),
            '[]'::json
          )
          from ${roomMembers}
          where ${roomMembers.roomId} = ${rooms.id}
        ) as "members"
      from ${rooms}
      join ${matches} on ${matches.roomId} = ${rooms.id}
      left join ${players} on ${players.matchId} = ${matches.id}
      left join ${roomMembers} on ${roomMembers.roomId} = ${rooms.id} and ${roomMembers.userId} = ${players.userId}
      where ${rooms.code} = ${code} and (${rooms.expiresAt} is null or ${rooms.expiresAt} > now())
      group by ${rooms.id}, ${matches.id}
    `);
    rows = [...result.rows];
  } catch (cause) {
    throw new RoomServiceError({ cause });
  }
  const room = rows[0];
  // An expired room and a code that never existed are the same answer on purpose:
  // a wrong code should not reveal that a room was ever here.
  if (!room) throw new RoomError(404, "room_not_found", "That room isn't live");
  return room;
}

/** The lowest unused seat, so a player who leaves and rejoins does not push the table wider. */
function nextFreeSeat(taken: readonly number[]): number {
  for (let seat = 0; seat < MAX_SEATS; seat += 1) {
    if (!taken.includes(seat)) return seat;
  }
  throw new RoomError(409, "room_full", "This room has no free seat");
}

/**
 * The honest refusal for a caller with no seat. A spectator is a member — telling
 * them they are "not in this room" would be false; what is true is that watching
 * carries no right to write.
 */
function refusalForUnseated(room: FoundRoom, userId: string): RoomError {
  const member = room.members.find((entry) => entry.userId === userId);
  if (member?.role === "spectator") {
    return new RoomError(403, "spectator_read_only", "Spectators watch — take a seat to throw");
  }
  return new RoomError(403, "not_a_member", "You are not in this room");
}

export { MAX_SEATS, MAX_SPECTATORS, ROOM_TTL_HOURS };
