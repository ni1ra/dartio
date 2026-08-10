"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommandDock, Surface } from "navi-ui";
import {
  applyDart,
  notation,
  replay,
  x01LogFromTurns,
  x01PlayerStats,
  type Dart,
  type InRule,
  type OutRule,
  type X01Log,
  type X01Options,
} from "@/domain";
import { completeRoomMatch, fileRoomTurn, readRoom, type RoomStateView } from "@/lib/product/rooms-client";
import { DartInputPad } from "./dart-input-pad";
import { Dartboard } from "./dartboard";

/**
 * An X01 match played inside a room.
 *
 * The room is the record. State is rebuilt by replaying the visits the server
 * holds, exactly the way a local match replays its own log — so joining, coming
 * back after a reload, and catching up on somebody else's throw are all the same
 * code path rather than three.
 *
 * A visit is filed when it is finished, never dart by dart. That is what makes the
 * writer lock meaningful: a whole visit is the unit two people can collide on, and
 * a half-thrown visit is nobody's business but the thrower's.
 *
 * This deliberately does not reuse the local match component. That one owns its own
 * log and files the whole match to history when it ends; a room match must not,
 * because the room already *is* the row — running both would file one game twice.
 */

/** Faster than the lobby, because a stalled poll mid-leg is worse than a stalled waiting room. */
const POLL_MS = 2000;
const MAX_CONSECUTIVE_FAILURES = 4;

interface RoomMatchProps {
  readonly code: string;
}

type Phase = "loading" | "playing" | "unavailable";

export function RoomMatch({ code }: RoomMatchProps) {
  const [room, setRoom] = useState<RoomStateView | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("Joining the room…");
  const [pending, setPending] = useState<readonly Dart[]>([]);
  const [stale, setStale] = useState(false);
  const failures = useRef(0);
  const reported = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await readRoom(code, 0, signal ? { signal } : {});
    if (signal?.aborted) return;
    if (!result.ok) {
      failures.current += 1;
      if (failures.current >= MAX_CONSECUTIVE_FAILURES) { setStale(true); setPhase((current) => current === "loading" ? "unavailable" : current); }
      return;
    }
    failures.current = 0;
    setStale(false);
    setRoom(result.value);
    setPhase("playing");
  }, [code]);

  useEffect(() => {
    const controller = new AbortController();
    // Deferred a frame, the same way the local match defers its resume read: the
    // first load must not land as a synchronous setState inside the effect.
    const frame = window.requestAnimationFrame(() => void load(controller.signal));
    const timer = window.setInterval(() => void load(controller.signal), POLL_MS);
    return () => { controller.abort(); window.cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, [load]);

  const log = useMemo<X01Log | null>(() => {
    if (!room) return null;
    const options = roomOptions(room.options);
    const players = room.seats.map((seat) => ({ id: `seat-${seat.seat}`, name: seat.displayName }));
    if (players.length === 0) return null;
    return x01LogFromTurns(options, players, room.turns as never);
  }, [room]);

  const game = useMemo(() => (log ? replay(log).state : null), [log]);
  // The visit in progress is local until it is finished, so it is folded on top.
  const projected = useMemo(() => {
    if (!game) return null;
    return pending.reduce((state, thrown) => {
      try { return applyDart(state, thrown); } catch { return state; }
    }, game);
  }, [game, pending]);

  const yourSeat = room?.yourSeat ?? null;
  // A spectator is in the room with no seat; every input surface keys off this.
  const spectating = room?.yourRole === "spectator";
  const yourTurn = game !== null && yourSeat !== null && game.status === "playing" && game.currentPlayer === yourSeat;
  const finished = game?.status === "complete";

  // Whoever is in the room reports the finish; the server treats the second report
  // as agreement rather than a conflict.
  useEffect(() => {
    if (!finished || !room || yourSeat === null || reported.current) return;
    reported.current = true;
    const winnerSeat = game?.winnerId ? Number(game.winnerId.replace("seat-", "")) : null;
    void completeRoomMatch(code, Number.isInteger(winnerSeat) ? winnerSeat : null);
  }, [finished, room, yourSeat, game, code]);

  async function throwDart(value: Dart) {
    if (!yourTurn || !game) return;
    const next = [...pending, value];
    let state = game;
    for (const thrown of next) {
      try { state = applyDart(state, thrown); } catch { return; }
    }
    // A visit ends when the rules say it does — three darts, a finish, or a bust.
    if (state.turns.length === game.turns.length) { setPending(next); setMessage(`${notation(value)} · ${3 - next.length} left`); return; }

    setPending([]);
    setMessage("Sending your visit…");
    const visit = state.turns[state.turns.length - 1]!;
    const result = await fileRoomTurn(code, {
      expectedVersion: room?.version ?? 0,
      seat: yourSeat!,
      turn: {
        legNumber: visit.legNumber,
        scoreBefore: visit.scoreBefore,
        scoreAfter: visit.scoreAfter,
        bust: visit.bust,
        dartsThrown: visit.dartsThrown,
        darts: next.map((thrown, index) => ({
          ordinal: (index + 1) as 1 | 2 | 3,
          segment: thrown.segment,
          multiplier: thrown.multiplier,
          ...(thrown.x === undefined ? {} : { x: thrown.x }),
          ...(thrown.y === undefined ? {} : { y: thrown.y }),
        })),
      },
    });

    if (result.ok) { setMessage("Visit sent."); await load(); return; }
    if (result.failure === "version_conflict") {
      // Somebody threw while this visit was being entered. Their visit stands; this
      // one is re-entered against the room as it now is.
      setMessage("Somebody threw first — catching up. Throw that visit again.");
      await load();
      return;
    }
    setMessage("That visit could not be sent. Nothing was scored.");
  }

  if (phase === "loading") return <div className="page-frame room-match"><p role="status">Joining the room…</p></div>;
  if (phase === "unavailable" || !room || !game || !projected) {
    return <div className="page-frame room-match">
      <Surface className="room-lobby"><h2>That room isn’t reachable.</h2><p>The code may have expired, or the room is unavailable right now. Nothing you threw has been lost.</p><Link className="button-link" href="/friends">Back to rooms</Link></Surface>
    </div>;
  }

  const stats = game.players.map((player) => x01PlayerStats(game, player.id));

  return <div className="page-frame room-match">
    <header className="match-header">
      <div>
        <span className={finished ? "match-complete" : "match-live"}>{!finished && <i />} {finished ? "MATCH COMPLETE" : spectating ? `WATCHING · ROOM ${room.code}` : `LEG ${game.legNumber} · ROOM ${room.code}`}</span>
        <b>{game.options.startingScore} · first to {game.options.legsToWin}{room.watching > 0 && <> · {room.watching} watching</>}</b>
      </div>
      <div className="match-tools"><span>{stale ? "Reconnecting…" : spectating ? onThrow(room, projected) : yourTurn ? "Your throw" : "Waiting for your opponent"}</span></div>
    </header>

    <section className="score-race" aria-label="Scoreboard">
      {room.seats.map((seat, index) => <div key={seat.seat} className={`score-player ${!finished && projected.currentPlayer === index ? "active" : ""} ${index > 0 ? "opponent" : ""}`}>
        <span>{seat.displayName} <i>{seat.isYou ? "you" : "away"}</i></span>
        <strong>{projected.scores[index] ?? game.options.startingScore}</strong>
        <small>{stats[index]?.dartsThrown ? `${stats[index]!.threeDartAverage.toFixed(2)} 3DA` : "No darts yet"}</small>
      </div>)}
    </section>

    {/* The board stays for a watcher — it is the display — but the pad is purely
        an input surface and would be dead weight under fingers that cannot throw. */}
    <Dartboard darts={pending} disabled={!yourTurn} onDart={(value) => void throwDart(value)} />
    {!spectating && <DartInputPad disabled={!yourTurn} onDart={(value) => void throwDart(value)} />}

    <CommandDock className="match-dock">
      <span aria-live="polite">{finished ? "Match complete." : spectating ? "You’re watching — visits land as they’re thrown." : message}</span>
      <div>{finished && <Link className="button-link" href="/friends">Back to rooms</Link>}</div>
    </CommandDock>
  </div>;
}

/** What a watcher's header says: whose throw the match is waiting on. */
function onThrow(room: RoomStateView, projected: { currentPlayer: number }): string {
  const seat = room.seats[projected.currentPlayer];
  return seat ? `${seat.displayName} to throw` : "Watching";
}

/** Room settings arrive as free-form JSON; anything unrecognised falls back to a standard 501. */
function roomOptions(raw: Record<string, unknown>): X01Options {
  const rule = (value: unknown, fallback: InRule): InRule =>
    value === "straight" || value === "double" || value === "master" ? value : fallback;
  const positive = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
  return {
    startingScore: positive(raw.startingScore, 501),
    legsToWin: positive(raw.legsToWin, 3),
    setsToWin: positive(raw.setsToWin, 1),
    inRule: rule(raw.inRule, "straight"),
    outRule: rule(raw.outRule, "double") as OutRule,
  };
}
