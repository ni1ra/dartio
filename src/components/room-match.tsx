"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, CommandDock, Surface } from "navi-ui";
import {
  applyDart,
  dart,
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
import { reconcileHeldRoomVisit, type HeldRoomVisit } from "@/lib/product/room-visit-recovery";
import {
  completeRoomMatch,
  fileRoomTurn,
  readRoom,
  type FiledTurn,
  type RoomStateView,
} from "@/lib/product/rooms-client";
import { DartInputPad } from "./dart-input-pad";
import { Dartboard } from "./dartboard";
import { useScreenWakeLock } from "./use-screen-wake-lock";
import { VoiceControl } from "./voice-control";

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
type SubmissionState = "idle" | "sending" | "checking" | "retryable" | "unknown" | "accepted";
type CompletionState = "idle" | "sending" | "unconfirmed" | "confirmed";

export function RoomMatch({ code }: RoomMatchProps) {
  const [room, setRoom] = useState<RoomStateView | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("Joining the room…");
  const [pending, setPending] = useState<readonly Dart[]>([]);
  const [stale, setStale] = useState(false);
  const failures = useRef(0);
  const reported = useRef(false);
  const roomRef = useRef<RoomStateView | null>(null);
  const loadGeneration = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const loadInFlight = useRef(false);
  const pollPaused = useRef(false);
  const submissionGeneration = useRef(0);
  const submissionController = useRef<AbortController | null>(null);
  const completionGeneration = useRef(0);
  const completionController = useRef<AbortController | null>(null);
  const heldRef = useRef<HeldRoomVisit | null>(null);
  const submissionStateRef = useRef<SubmissionState>("idle");
  const [held, setHeld] = useState<HeldRoomVisit | null>(null);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [acceptedVersion, setAcceptedVersion] = useState<number | null>(null);
  const [completionState, setCompletionState] = useState<CompletionState>("idle");

  roomRef.current = room;
  heldRef.current = held;
  submissionStateRef.current = submissionState;

  const updateSubmissionState = useCallback((state: SubmissionState) => {
    submissionStateRef.current = state;
    setSubmissionState(state);
  }, []);

  const load = useCallback(async (supersede = false): Promise<RoomStateView | null> => {
    // Polls never overlap. A recovery read is allowed to supersede one, and its
    // generation is the only one that may write UI authority afterwards.
    if (!supersede && loadInFlight.current) return null;
    if (supersede) loadController.current?.abort();
    const controller = new AbortController();
    const attempt = ++loadGeneration.current;
    loadController.current = controller;
    loadInFlight.current = true;
    const result = await readRoom(code, 0, { signal: controller.signal });
    if (controller.signal.aborted || attempt !== loadGeneration.current) return null;
    loadController.current = null;
    loadInFlight.current = false;
    if (!result.ok) {
      failures.current += 1;
      if (failures.current >= MAX_CONSECUTIVE_FAILURES) {
        pollPaused.current = true;
        setStale(true);
        setPhase((current) => current === "loading" ? "unavailable" : current);
      }
      return null;
    }

    const current = roomRef.current;
    const currentTerminal = current?.status === "complete" || current?.status === "abandoned";
    const incomingTerminal = result.value.status === "complete" || result.value.status === "abandoned";
    if (current && (result.value.version < current.version
      // Terminal room state is one-way. In particular, close and completion can
      // share a visit version, so a delayed `complete` snapshot must never replace
      // an already observed canonical abandonment.
      || (current.status === "abandoned" && result.value.status !== "abandoned")
      || (currentTerminal && !incomingTerminal))) {
      return current;
    }
    failures.current = 0;
    pollPaused.current = false;
    setStale(false);
    roomRef.current = result.value;
    setRoom(result.value);
    setPhase("playing");
    return result.value;
  }, [code]);

  useEffect(() => {
    // Deferred a frame, the same way the local match defers its resume read: the
    // first load must not land as a synchronous setState inside the effect.
    const frame = window.requestAnimationFrame(() => void load(true));
    const timer = window.setInterval(() => {
      if (!pollPaused.current && !heldRef.current && submissionStateRef.current !== "accepted") void load();
    }, POLL_MS);
    return () => {
      loadGeneration.current += 1;
      loadController.current?.abort();
      loadController.current = null;
      loadInFlight.current = false;
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => () => {
    submissionGeneration.current += 1;
    submissionController.current?.abort();
    completionGeneration.current += 1;
    completionController.current?.abort();
  }, []);

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
  // A closed room takes no more darts even though the replayed game still says
  // "playing" — the server would refuse the visit; the inputs must not offer it.
  const closed = room?.status === "abandoned";
  const submitting = submissionState === "sending" || submissionState === "checking";
  const yourTurn = game !== null
    && yourSeat !== null
    && !closed
    && !stale
    && !held
    && submissionState === "idle"
    && game.status === "playing"
    && game.currentPlayer === yourSeat;
  const finished = game?.status === "complete";
  useScreenWakeLock(phase === "playing" && yourSeat !== null && !stale && !closed && !finished);

  // Whoever is in the room reports the finish; the server treats the second report
  // as agreement rather than a conflict.
  useEffect(() => {
    if (!finished || closed || !room || yourSeat === null || reported.current) return;
    reported.current = true;
    const winnerSeat = game?.winnerId ? Number(game.winnerId.replace("seat-", "")) : null;
    void reportFinish(Number.isInteger(winnerSeat) ? winnerSeat : null);
    // `reportFinish` is intentionally guarded by `reported`; adding the render-
    // local function as a dependency would turn unrelated room renders into
    // finish requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, closed, room, yourSeat, game, code]);

  async function reportFinish(winnerSeat: number | null) {
    completionController.current?.abort();
    const controller = new AbortController();
    const attempt = ++completionGeneration.current;
    completionController.current = controller;
    setCompletionState("sending");
    const result = await completeRoomMatch(code, winnerSeat, { signal: controller.signal });
    if (controller.signal.aborted || attempt !== completionGeneration.current) return;
    completionController.current = null;
    if (result.ok) {
      setCompletionState("confirmed");
      setMessage(result.value.alreadyComplete ? "Match finish confirmed." : "Match finish sent.");
      await load(true);
      return;
    }
    if (result.failure === "room_closed") {
      setCompletionState("confirmed");
      await load(true);
      return;
    }
    setCompletionState("unconfirmed");
    setMessage("The match is complete here, but the room has not confirmed it yet.");
  }

  async function recoverHeldVisit(visit: HeldRoomVisit) {
    updateSubmissionState("checking");
    setMessage("Checking whether the room accepted that visit…");
    const snapshot = await load(true);
    if (!snapshot) {
      updateSubmissionState("unknown");
      setMessage("Visit held on this device. Dartio still cannot confirm whether it landed.");
      return;
    }
    const resolution = reconcileHeldRoomVisit(snapshot, visit);
    if (resolution === "accepted") {
      setHeld(null);
      heldRef.current = null;
      setPending([]);
      updateSubmissionState("idle");
      setMessage("Visit confirmed from the room record.");
      return;
    }
    if (resolution === "retryable") {
      updateSubmissionState("retryable");
      setMessage("The room is unchanged. Retry this held visit, or discard it and throw again.");
      return;
    }
    if (resolution === "stale") {
      updateSubmissionState("unknown");
      setMessage("That room read was older than your held visit. Check the room again.");
      return;
    }
    setHeld(null);
    heldRef.current = null;
    setPending([]);
    updateSubmissionState("idle");
    setMessage(resolution === "closed"
      ? "The room closed before that visit could be accepted."
      : "Another accepted visit moved the room on. Throw yours again from the updated board.");
  }

  async function submitHeldVisit(visit: HeldRoomVisit) {
    submissionController.current?.abort();
    const controller = new AbortController();
    const attempt = ++submissionGeneration.current;
    submissionController.current = controller;
    updateSubmissionState("sending");
    setMessage("Sending your visit…");
    const result = await fileRoomTurn(code, visit as FiledTurn, { signal: controller.signal });
    if (controller.signal.aborted || attempt !== submissionGeneration.current) return;
    submissionController.current = null;
    if (result.ok) {
      // The POST result proves acceptance. Input remains locked until a read has
      // caught the shared record up to that accepted version.
      setAcceptedVersion(result.value.version);
      setHeld(null);
      heldRef.current = null;
      setPending([]);
      updateSubmissionState("accepted");
      setMessage("Visit accepted. Catching the shared board up…");
      const snapshot = await load(true);
      if (snapshot && snapshot.version >= result.value.version) {
        setAcceptedVersion(null);
        updateSubmissionState("idle");
        setMessage("Visit sent.");
      }
      return;
    }
    if (result.failure === "version_conflict" || result.failure === "rooms_unavailable") {
      await recoverHeldVisit(visit);
      return;
    }
    setHeld(null);
    heldRef.current = null;
    setPending([]);
    updateSubmissionState("idle");
    if (result.failure === "room_closed") await load(true);
    setMessage(result.failure === "room_closed"
      ? "The room closed before that visit could be accepted."
      : "The room refused that visit. Nothing from it was scored.");
  }

  async function throwDart(value: Dart) {
    if (!yourTurn || !game) return;
    const next = [...pending, value];
    let state = game;
    for (const thrown of next) {
      try { state = applyDart(state, thrown); } catch { return; }
    }
    // A visit ends when the rules say it does — three darts, a finish, or a bust.
    if (state.turns.length === game.turns.length) { setPending(next); setMessage(`${notation(value)} · ${3 - next.length} left`); return; }

    const visit = state.turns[state.turns.length - 1]!;
    const heldVisit: HeldRoomVisit = {
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
    };
    setPending(next);
    setHeld(heldVisit);
    heldRef.current = heldVisit;
    await submitHeldVisit(heldVisit);
  }

  function undoPending() {
    if (submitting || held || submissionState !== "idle" || pending.length === 0) return;
    setPending((current) => current.slice(0, -1));
    setMessage("Last local dart taken back");
  }

  async function refreshAcceptedVisit() {
    const snapshot = await load(true);
    if (snapshot && acceptedVersion !== null && snapshot.version >= acceptedVersion) {
      setAcceptedVersion(null);
      updateSubmissionState("idle");
      setMessage("Shared board caught up.");
    }
  }

  function discardRetryableVisit() {
    if (!held || submissionState !== "retryable") return;
    setHeld(null);
    heldRef.current = null;
    setPending([]);
    updateSubmissionState("idle");
    setMessage("Held local visit discarded. Throw it again when ready.");
  }

  async function reconnect() {
    setMessage("Checking the room…");
    const snapshot = await load(true);
    setMessage(snapshot ? "Room connection restored." : "The room is still unreachable. Your last shared board remains here.");
  }

  if (phase === "loading") return <div className="page-frame room-match"><p role="status">Joining the room…</p></div>;
  if (phase === "unavailable" || !room || !game || !projected) {
    return <div className="page-frame room-match">
      <Surface className="room-lobby"><h2>That room isn’t reachable.</h2><p>The code may have expired, or the room is unavailable right now. No server-accepted visit can be erased by reconnecting.</p><div className="room-recovery-actions"><Button onClick={() => void reconnect()}>Try room again</Button><Link className="button-link button-link-secondary" href="/friends">Back to rooms</Link></div></Surface>
    </div>;
  }

  const stats = game.players.map((player) => x01PlayerStats(game, player.id));

  return <div className="page-frame room-match">
    <header className="match-header">
      <div>
        <span className={finished || closed ? "match-complete" : "match-live"}>{!finished && !closed && <i />} {closed ? `ROOM CLOSED · ${room.code}` : finished ? "MATCH COMPLETE" : spectating ? `WATCHING · ROOM ${room.code}` : `LEG ${game.legNumber} · ROOM ${room.code}`}</span>
        <b>{game.options.startingScore} · first to {game.options.legsToWin}{room.watching > 0 && <> · {room.watching} watching</>}</b>
      </div>
      <div className="match-tools"><span>{stale ? "Reconnecting…" : closed ? "The host closed this room" : spectating ? onThrow(room, projected) : yourTurn ? "Your throw" : "Waiting for your opponent"}</span></div>
    </header>

    <section className="score-race" aria-label="Scoreboard">
      {room.seats.map((seat, index) => <div key={seat.seat} className={`score-player ${!closed && !finished && projected.currentPlayer === index ? "active" : ""} ${index > 0 ? "opponent" : ""}`}>
        <span>{seat.displayName} <i>{seat.isYou ? "you" : "away"}</i></span>
        <strong>{projected.scores[index] ?? game.options.startingScore}</strong>
        <small>{stats[index]?.dartsThrown ? `${stats[index]!.threeDartAverage.toFixed(2)} 3DA` : "No darts yet"}</small>
      </div>)}
    </section>

    {/* The board stays as the room's display for watchers and closed matches. The
        pad is purely an input surface, so it disappears when no future throw can
        be accepted instead of leaving a permanently disabled control behind. */}
    <Dartboard darts={pending} disabled={!yourTurn} onDart={(value) => void throwDart(value)} />
    {!spectating && !closed && !finished && <>
      <DartInputPad disabled={!yourTurn} onDart={(value) => void throwDart(value)} />
      <VoiceControl
        revision={(room.version * 4) + pending.length}
        disabled={!yourTurn}
        mode="room"
        onDart={(segment, multiplier) => void throwDart(dart(segment as Dart["segment"], multiplier))}
        onTurnScore={() => undefined}
        onUndo={undoPending}
        onNextPlayer={() => setMessage("Record every dart before ending the visit")}
      />
    </>}

    <CommandDock className="match-dock">
      <span aria-live="polite">{closed ? "The host closed this room. Nothing more will be thrown." : finished ? "Match complete." : spectating ? "You’re watching — visits land as they’re thrown." : message}</span>
      <div className="room-recovery-actions">
        {submissionState === "retryable" && held && <>
          <Button onClick={() => void submitHeldVisit(held)}>Retry held visit</Button>
          <Button variant="secondary" onClick={discardRetryableVisit}>Discard local visit</Button>
        </>}
        {submissionState === "unknown" && held && <Button onClick={() => void recoverHeldVisit(held)}>Check room</Button>}
        {submissionState === "accepted" && acceptedVersion !== null && <Button onClick={() => void refreshAcceptedVisit()}>Refresh shared board</Button>}
        {stale && !held && submissionState === "idle" && !finished && !closed && <Button onClick={() => void reconnect()}>Reconnect</Button>}
        {completionState === "unconfirmed" && finished && !closed && <Button onClick={() => {
          const winnerSeat = game.winnerId ? Number(game.winnerId.replace("seat-", "")) : null;
          void reportFinish(Number.isInteger(winnerSeat) ? winnerSeat : null);
        }}>Confirm finish</Button>}
        {(finished || closed) && <Link className="button-link" href="/friends">Back to rooms</Link>}
      </div>
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
