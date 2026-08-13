import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
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
      record("room.opened", { mode: input.mode });
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
  let claimed: { seat: number } | undefined;
  try {
    // Joining takes the same room/match locks as every terminal mutation. Without
    // that shared lock, a stale join could set an already-abandoned match active
    // again. The membership, seat, and activation also succeed or roll back as one.
    const result = await db.execute<{ seat: number }>(sql`
      with locked as materialized (
        select ${rooms.id} as room_id, ${matches.id} as match_id
        from ${rooms}
        join ${matches} on ${matches.roomId} = ${rooms.id}
        where ${rooms.id} = ${room.roomId}
          and (${rooms.expiresAt} is null or ${rooms.expiresAt} > now())
          and ${matches.status} in ('pending', 'active')
          and not exists (
            select 1 from ${players}
            where ${players.matchId} = ${matches.id} and ${players.seat} = ${seat}
          )
        for update of ${rooms}, ${matches}
      ), membership as (
        insert into ${roomMembers} (room_id, user_id, role)
        select locked.room_id, ${userId}, 'player' from locked
        on conflict (room_id, user_id) do update set role = 'player'
          where room_members.role = 'spectator'
        returning room_id
      ), seated as (
        insert into ${players} (id, match_id, user_id, seat, display_name, is_bot)
        select ${randomUUID()}, locked.match_id, ${userId}, ${seat}, ${displayName}, false
        from locked
        join membership on membership.room_id = locked.room_id
        returning match_id
      ), activated as (
        update ${matches}
           set status = 'active'
         where ${matches.id} in (select match_id from seated)
        returning ${matches.id}
      )
      select ${seat}::integer as "seat" from activated
    `);
    claimed = result.rows[0];
  } catch (cause) {
    if (isUniqueViolation(cause)) throw new RoomError(409, "seat_taken", "Somebody took that seat first");
    throw new RoomServiceError({ cause });
  }
  if (!claimed) {
    const current = await findRoom(room.code, db);
    const currentSeat = current.seats.find((entry) => entry.userId === userId);
    if (currentSeat) return { code: current.code, seat: currentSeat.seat };
    if (current.status === "complete" || current.status === "abandoned") {
      throw new RoomError(409, "room_closed", "This room's match has already finished");
    }
    if (current.seats.length >= MAX_SEATS) throw new RoomError(409, "room_full", "This room has no free seat");
    throw new RoomError(409, "seat_taken", "Somebody took that seat first");
  }
  return { code: room.code, seat: claimed.seat };
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

  let admitted: { role: RoomSeat["role"] } | undefined;
  try {
    // This deliberately uses two commands in one transaction. The first takes
    // the shared lifecycle locks; the second gets a fresh READ COMMITTED snapshot
    // after any waiter ahead of it commits, so two arrivals seeing chair 15 cannot
    // both insert chair 16. A single CTE would keep its opening snapshot while
    // waiting and could overshoot the gallery cap even though it held the lock.
    const [, result] = await db.batch([
      db.execute(sql`
        select ${rooms.id}
        from ${rooms}
        join ${matches} on ${matches.roomId} = ${rooms.id}
        where ${rooms.id} = ${room.roomId}
          and (${rooms.expiresAt} is null or ${rooms.expiresAt} > now())
          and ${matches.status} in ('pending', 'active')
        for update of ${rooms}, ${matches}
      `),
      db.execute<{ role: RoomSeat["role"] }>(sql`
        insert into ${roomMembers} (room_id, user_id, role)
        select ${rooms.id}, ${userId}, 'spectator'
        from ${rooms}
        join ${matches} on ${matches.roomId} = ${rooms.id}
        where ${rooms.id} = ${room.roomId}
          and (${rooms.expiresAt} is null or ${rooms.expiresAt} > now())
          and ${matches.status} in ('pending', 'active')
          and (
            select count(*) from ${roomMembers}
            where ${roomMembers.roomId} = ${rooms.id} and ${roomMembers.role} = 'spectator'
          ) < ${MAX_SPECTATORS}
        on conflict (room_id, user_id) do nothing
        returning ${roomMembers.role} as "role"
      `),
    ]);
    admitted = result.rows[0];
  } catch (cause) {
    // Two taps racing each other both wanted the same thing, and one of them got it.
    if (isUniqueViolation(cause)) return { code: room.code, role: "spectator" };
    throw new RoomServiceError({ cause });
  }
  if (!admitted) {
    const current = await findRoom(room.code, db);
    const currentMember = current.members.find((entry) => entry.userId === userId);
    if (currentMember) return { code: current.code, role: currentMember.role };
    if (current.status === "complete" || current.status === "abandoned") {
      throw new RoomError(409, "room_closed", "This room's match has already finished");
    }
    if (current.members.filter((entry) => entry.role === "spectator").length >= MAX_SPECTATORS) {
      throw new RoomError(409, "gallery_full", "This room's gallery is full");
    }
    throw new RoomServiceError();
  }
  record("room.spectated");
  return { code: room.code, role: admitted.role };
}

/**
 * Hands the room to another seated player.
 *
 * Ownership is transferred, never shared and never vacated: one locked statement
 * demotes every old host label, promotes the new one, and moves
 * `rooms.owner_user_id` with it so the row and membership agree.
 * Only a seated human can receive the room — a spectator holds no seat, and a bot
 * seat has nobody behind it to decide anything.
 */
export async function handOverRoom(
  userId: string,
  code: string,
  toSeat: number,
  db: Database = createDatabase(),
): Promise<{ readonly code: string; readonly hostSeat: number }> {
  const room = await findRoom(normalizeRoomCode(code), db);
  if (room.ownerUserId !== userId) throw new RoomError(403, "not_the_host", "Only the host hands the room over");
  if (room.status === "complete" || room.status === "abandoned") {
    throw new RoomError(409, "room_closed", "This room's match has already finished");
  }

  const target = room.seats.find((seat) => seat.seat === toSeat);
  if (!target || target.userId === null) throw new RoomError(422, "unknown_seat", "That seat has nobody to host from");
  // Handing the room to yourself is agreement with the current state, not an error.
  if (target.userId === userId) return { code: room.code, hostSeat: toSeat };

  let moved: { hostSeat: number } | undefined;
  try {
    // Lock the room and match in one statement before changing either. A competing
    // handover, close, or finish waits, then rechecks the owner and terminal state.
    // Reconciliation demotes every non-target owner, not only the caller, so the
    // first safe handover also repairs any duplicate label left by older code.
    const result = await db.execute<{ hostSeat: number }>(sql`
      with locked as materialized (
        select ${rooms.id} as room_id
        from ${rooms}
        join ${matches} on ${matches.roomId} = ${rooms.id}
        where ${rooms.id} = ${room.roomId}
          and ${rooms.ownerUserId} = ${userId}
          and ${matches.status} in ('pending', 'active')
          and exists (
            select 1 from ${roomMembers}
            where ${roomMembers.roomId} = ${rooms.id}
              and ${roomMembers.userId} = ${target.userId}
              and ${roomMembers.role} in ('owner', 'player')
          )
        for update of ${rooms}, ${matches}
      ), moved as (
        update ${rooms}
           set owner_user_id = ${target.userId}
         where ${rooms.id} in (select room_id from locked)
        returning ${rooms.id} as room_id
      ), reconciled as (
        update ${roomMembers}
           set role = case
             when ${roomMembers.userId} = ${target.userId} then 'owner'::room_member_role
             else 'player'::room_member_role
           end
         where ${roomMembers.roomId} in (select room_id from moved)
           and (${roomMembers.role} = 'owner' or ${roomMembers.userId} = ${target.userId})
        returning ${roomMembers.userId} as user_id, ${roomMembers.role} as role
      )
      select ${toSeat}::integer as "hostSeat"
      from reconciled
      where user_id = ${target.userId} and role = 'owner'
    `);
    moved = result.rows[0];
  } catch (cause) {
    throw new RoomServiceError({ cause });
  }
  if (!moved) {
    const current = await findRoom(room.code, db);
    if (current.status === "complete" || current.status === "abandoned") {
      throw new RoomError(409, "room_closed", "This room's match has already finished");
    }
    if (current.ownerUserId !== userId) {
      throw new RoomError(403, "not_the_host", "Only the current host hands the room over");
    }
    throw new RoomServiceError();
  }
  record("room.handed_over");
  return { code: room.code, hostSeat: moved.hostSeat };
}

/**
 * The host closes the room: the match is marked abandoned, no winner is named,
 * and no more visits are taken.
 *
 * This is the first writer the `abandoned` status has ever had, and the first
 * thing ownership mechanically authorizes — before this cycle "owner" was a label.
 * `completed_at` stays null on purpose: the match did not complete, and pretending
 * it did would file a fiction into every query that reads completion.
 */
export async function closeRoom(
  userId: string,
  code: string,
  db: Database = createDatabase(),
): Promise<{ readonly alreadyClosed: boolean }> {
  const room = await findRoom(normalizeRoomCode(code), db);
  if (room.ownerUserId !== userId) throw new RoomError(403, "not_the_host", "Only the host closes the room");
  if (room.status === "abandoned") return { alreadyClosed: true };
  if (room.status === "complete") {
    // A finished match cannot be un-finished into an abandonment.
    throw new RoomError(409, "room_closed", "This room's match has already finished");
  }

  let closed: { status: RoomState["status"] } | undefined;
  try {
    // The lock makes close, finish, and handover an ordered choice. Whichever
    // terminal transition wins first is the one every later caller observes.
    const result = await db.execute<{ status: RoomState["status"] }>(sql`
      with locked as materialized (
        select ${matches.id} as match_id
        from ${rooms}
        join ${matches} on ${matches.roomId} = ${rooms.id}
        where ${rooms.id} = ${room.roomId}
          and ${rooms.ownerUserId} = ${userId}
          and ${matches.status} in ('pending', 'active')
        for update of ${rooms}, ${matches}
      )
      update ${matches}
         set status = 'abandoned'
       where ${matches.id} in (select match_id from locked)
      returning ${matches.status} as "status"
    `);
    closed = result.rows[0];
  } catch (cause) {
    throw new RoomServiceError({ cause });
  }
  if (!closed) {
    const current = await findRoom(room.code, db);
    if (current.ownerUserId !== userId) throw new RoomError(403, "not_the_host", "Only the current host closes the room");
    if (current.status === "abandoned") return { alreadyClosed: true };
    if (current.status === "complete") throw new RoomError(409, "room_closed", "This room's match has already finished");
    throw new RoomServiceError();
  }
  record("room.closed_by_host");
  return { alreadyClosed: false };
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

  const turnId = randomUUID();
  const storedDarts = dartRows(turnId, input.turn.darts).map(({ ordinal, segment, multiplier, x, y }) => ({ ordinal, segment, multiplier, x, y }));
  let claimed: { version: number } | undefined;
  try {
    // Claiming the version, inserting the visit, and inserting its darts are one
    // Postgres statement. A rejected statement rolls the version claim back too;
    // after an outcome-unknown transport failure, the caller rereads the room.
    // Either way, state_version and the complete turn commit together.
    const result = await db.execute<{ version: number }>(sql`
      with claimed as (
        update ${matches}
           set state_version = ${matches.stateVersion} + 1
         where ${matches.id} = ${room.matchId}
           and ${matches.stateVersion} = ${input.expectedVersion}
           and ${matches.status} in ('pending', 'active')
        returning ${matches.stateVersion} as version
      ), inserted_turn as (
        insert into ${turns} (
          id, match_id, player_id, turn_number, leg_number, score_before,
          score_after, bust, darts_thrown, aggregate_score
        )
        select
          ${turnId}, ${room.matchId}, ${seated.playerId}, claimed.version,
          ${input.turn.legNumber}, ${input.turn.scoreBefore}, ${input.turn.scoreAfter},
          ${input.turn.bust}, ${input.turn.dartsThrown}, ${input.turn.aggregateScore ?? null}
        from claimed
        returning id
      ), inserted_darts as (
        insert into ${darts} (turn_id, ordinal, segment, multiplier, x_microunits, y_microunits)
        select inserted_turn.id, thrown.ordinal, thrown.segment, thrown.multiplier, thrown.x, thrown.y
        from inserted_turn
        cross join jsonb_to_recordset(${JSON.stringify(storedDarts)}::jsonb)
          as thrown(ordinal integer, segment integer, multiplier integer, x integer, y integer)
        returning id
      )
      select claimed.version as "version" from claimed
    `);
    claimed = result.rows[0];
  } catch (cause) {
    recordFailure("room.turn_failed", cause, { count: input.expectedVersion + 1 });
    throw new RoomServiceError({ cause });
  }
  if (!claimed) {
    const current = await findRoom(room.code, db);
    if (current.status === "complete" || current.status === "abandoned") {
      throw new RoomError(409, "room_closed", "This room's match has already finished");
    }
    // Worth counting rather than only refusing: a room producing these steadily
    // means two clients disagree about whose turn it is, not that people are fast.
    record("room.version_conflict", { count: input.expectedVersion }, "warn");
    throw new RoomError(409, "version_conflict", "Somebody else threw first — catch up and try again");
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
  if (room.status === "abandoned") throw new RoomError(409, "room_closed", "The host closed this room");

  const winner = winnerSeat === null ? null : room.seats.find((seat) => seat.seat === winnerSeat);
  if (winnerSeat !== null && !winner) {
    throw new RoomError(422, "unknown_seat", "That seat is not in this room");
  }

  let completed: { status: RoomState["status"] } | undefined;
  try {
    const result = await db.execute<{ status: RoomState["status"] }>(sql`
      update ${matches}
         set status = 'complete',
             winner_player_id = ${winner?.playerId ?? null},
             completed_at = ${new Date()}
       where ${matches.id} = ${room.matchId}
         and ${matches.status} in ('pending', 'active')
      returning ${matches.status} as "status"
    `);
    completed = result.rows[0];
  } catch (cause) {
    throw new RoomServiceError({ cause });
  }
  if (!completed) {
    const current = await findRoom(room.code, db);
    if (current.status === "complete") return { alreadyComplete: true };
    if (current.status === "abandoned") throw new RoomError(409, "room_closed", "The host closed this room");
    throw new RoomServiceError();
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
  /** Canonical host authority; membership roles mirror this for display. */
  readonly ownerUserId: string;
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
        ${rooms.ownerUserId} as "ownerUserId",
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
