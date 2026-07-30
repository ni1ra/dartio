"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, CommandDock, IconButton, Modal } from "navi-ui";
import {
  aiTactics, applyRoundDart,
  appendRoundEvent, chooseRoundAim, createRoundLog, notation, replayRound, rewindRoundToVisit, ROUND_MODES,
  liveRoundView, roundDartEvent, roundMatchRecord, seededRandom, throwAiDart, undoLastRoundEvent,
  type Dart, type RoundLog, type RoundModeId, type RoundState,
} from "@/domain";
import { DartInputPad } from "./dart-input-pad";
import { Dartboard } from "./dartboard";
import { useAiVisit } from "./use-ai-visit";
import { useMatchKeyboard } from "./use-match-keyboard";
import { useRecordMatch } from "./use-record-match";

/**
 * One opponent visit, as darts rather than as a resulting state, so a corrected or
 * resumed game replays them exactly as it replays the player's. Seeded from the
 * completed-visit count, so the same log always produces the same visit.
 *
 * Levels stop at eight because that is the free tier exactly. Nine to twenty are
 * server-authorized, and the route that authorizes them speaks X01 — extending it
 * would mean teaching the server every mode's rules.
 */
function roundAiDarts(state: RoundState, level: number): readonly Dart[] {
  const rng = seededRandom(state.visits.length * 101 + level);
  const tactics = aiTactics(level);
  let next = state;
  const thrown: Dart[] = [];
  while (next.status === "playing" && next.currentPlayer === 1) {
    const value = throwAiDart(level, chooseRoundAim(next, 1, tactics, next.currentDarts), rng).dart;
    thrown.push(value);
    next = applyRoundDart(next, value);
  }
  return thrown;
}

const STORAGE_PREFIX = "dartio:round-log:v1:";

/**
 * One screen for every round-based mode.
 *
 * The modes differ in how a visit scores, not in how a visit is played, so they
 * share a surface: a target line, a running total, the shared board, the shared
 * pad, and the shared keyboard. What each mode contributes is its `RoundRules`
 * entry — the screen reads the target and the totals and never branches on
 * which mode it is showing.
 */
export function RoundMatch({ mode }: { mode: RoundModeId }) {
  const params = useSearchParams();
  const opponent = params.get("opponent");
  const isAi = opponent === "ai";
  // Solo remains the default: these modes are practice first, and an opponent is
  // something you ask for.
  const solo = !isAi && opponent !== "local";
  const requestedLevel = Number(params.get("level"));
  const level = Number.isInteger(requestedLevel) ? Math.min(8, Math.max(1, requestedLevel)) : 5;
  const rules = ROUND_MODES[mode];

  const freshLog = useMemo(() => createRoundLog(
    mode,
    solo ? [{ id: "you", name: "Player 1" }] : [{ id: "you", name: "Player 1" }, { id: "them", name: isAi ? "The Navigator" : "Player 2" }],
  ), [mode, solo, isAi]);

  const [log, setLog] = useState<RoundLog>(freshLog);
  // Read synchronously by the opponent, which commits from a timer created a visit
  // earlier and must fold over what actually happened. See use-ai-visit.ts.
  const logRef = useRef<RoundLog>(freshLog);
  const [resumed, setResumed] = useState(false);
  const [correction, setCorrection] = useState(false);
  const [message, setMessage] = useState("Your throw · 3 darts");
  const { state: game } = useMemo(() => replayRound(log), [log]);
  const key = `${STORAGE_PREFIX}${mode}:${solo ? "solo" : "pair"}`;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return;
        const stored = JSON.parse(raw) as RoundLog;
        if (stored?.mode !== mode || !Array.isArray(stored.events) || stored.events.length === 0) return;
        if (stored.players.length !== freshLog.players.length) return;
        // Replaying the stored log is the validation: a corrupted one throws
        // here rather than resuming into a score that never happened.
        replayRound(stored);
        logRef.current = stored;
        setLog(stored);
        setResumed(true);
        setMessage("Match resumed where you left off");
      } catch {
        window.localStorage.removeItem(key);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [key, mode, freshLog.players.length]);

  useEffect(() => {
    if (log.events.length === 0) return;
    try { window.localStorage.setItem(key, JSON.stringify(log)); } catch { /* resume is optional */ }
  }, [log, key]);
  useEffect(() => {
    if (game.status !== "complete") return;
    try { window.localStorage.removeItem(key); } catch { /* ignored */ }
  }, [game.status, key]);
  // Seat one is the opponent's when one was asked for.
  const completedRecord = useMemo(
    () => (game.status === "complete" ? roundMatchRecord(log, [{}, { isBot: isAi, ...(isAi ? { botLevel: level } : {}) }]) : null),
    [game.status, log, isAi, level],
  );
  useRecordMatch(completedRecord);

  const disabled = game.status === "complete" || (isAi && game.currentPlayer !== 0);
  // Projected so the target moves and the total climbs as the visit is thrown.
  const { target, totals } = liveRoundView(game);

  function commit(darts: readonly Dart[]) {
    if (darts.length === 0) return;
    const appended = darts.reduce((current, value) => appendRoundEvent(current, roundDartEvent(value)), logRef.current);
    logRef.current = appended;
    setLog(appended);
  }

  function addDart(value: Dart) {
    if (disabled) return;
    commit([value]);
    setMessage(`${notation(value)} recorded`);
  }

  useAiVisit({
    ready: isAi && game.status === "playing" && game.currentPlayer === 1,
    play: () => {
      const current = replayRound(logRef.current).state;
      if (current.status !== "playing" || current.currentPlayer !== 1) return;
      commit(roundAiDarts(current, level));
      setMessage("Your throw · 3 darts");
    },
  });
  function undo() {
    if (log.events.length === 0) return;
    const undone = undoLastRoundEvent(log);
    logRef.current = undone;
    setLog(undone);
    setMessage("Last entry removed");
  }
  function rewind(visitIndex: number) {
    const rewound = rewindRoundToVisit(log, visitIndex);
    const dropped = log.events.length - rewound.events.length;
    // The ref moves with the state, or the opponent folds over the pre-correction log.
    logRef.current = rewound;
    setLog(rewound);
    setCorrection(false);
    setMessage(`Rewound ${dropped} ${dropped === 1 ? "entry" : "entries"} · throw the visit again`);
  }

  const keyboard = useMatchKeyboard({ onDart: addDart, onUndo: undo, disabled });
  const winner = game.players.find((player) => player.id === game.winnerId);
  const finished = game.status === "complete";

  return <div className="match-page round-page" data-input-mode="darts">
    <header className="match-header">
      <div>
        <span className={finished ? "match-complete" : "match-live"}>
          {!finished && <i />} {finished ? "MATCH COMPLETE" : `ROUND ${game.round}${rules.rounds === null ? "" : ` OF ${rules.rounds}`}`}
        </span>
        <b>{rules.name}</b>
      </div>
      <div className="match-tools">
        <IconButton label="Correct a visit" onClick={() => setCorrection(true)} disabled={disabled || game.visits.length === 0}>✎</IconButton>
        <IconButton label="Undo last dart" onClick={undo} disabled={disabled || log.events.length === 0}>↶</IconButton>
      </div>
    </header>

    {resumed && <div className="match-notice" role="status">
      Resumed the match that was in progress on this device.
      <button type="button" onClick={() => setResumed(false)}>Dismiss</button>
    </div>}
    {finished && <div className="match-notice" role="status">
      {winner ? `${winner.name} wins.` : "The match ended level."}
    </div>}

    <section className="round-scoreboard" aria-label="Scoreboard">
      <p className="round-target">
        {target === null
          ? "Everything counts"
          : <>Aiming at <strong>{target === 25 ? "the bull" : target}</strong></>}
      </p>
      <ol className="round-totals">
        {game.players.map((player, index) => (
          <li key={player.id} className={game.currentPlayer === index && !finished ? "active" : ""}>
            <span>{player.name}</span>
            <strong>{totals[index]}</strong>
            <small>{game.currentPlayer === index && !finished ? "at the oche" : "waiting"}</small>
          </li>
        ))}
      </ol>
    </section>

    <div className="match-grid cricket-grid">
      <section className="board-zone">
        <Dartboard
          darts={game.currentDarts}
          disabled={disabled}
          onDart={addDart}
          caption={target === null ? "Tap where the dart landed" : `Tap where the dart landed · target ${target === 25 ? "bull" : target}`}
        />
      </section>
      <aside className="match-side">
        <DartInputPad disabled={disabled} onDart={addDart} />
      </aside>
    </div>

    <CommandDock className="match-dock">
      <span aria-live="polite">{message}</span>
      {keyboard.pending !== "" && <span className="keyboard-buffer" aria-hidden="true">{keyboard.pending} · Enter single · D double · T treble</span>}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{keyboard.announcement}</span>
      <div>
        <button onClick={undo} disabled={disabled || log.events.length === 0}>Undo</button>
        <button onClick={() => setCorrection(true)} disabled={disabled || game.visits.length === 0}>Correct a visit</button>
      </div>
    </CommandDock>

    <Modal open={correction} onClose={() => setCorrection(false)} title="Correct a visit">
      <div className="correction-body">
        <p>Pick the visit that was recorded wrongly. The match rewinds to just before it, and you throw it again from there.</p>
        <ol className="correction-visits">
          {game.visits.map((visit, index) => (
            <li key={`${visit.round}-${index}`}>
              <div>
                <span>{game.players.find((player) => player.id === visit.playerId)?.name ?? "Player"}</span>
                <b>{visit.darts.map(notation).join(" ") || "—"}</b>
                <small>ROUND {visit.round} · {visit.scored >= 0 ? "+" : ""}{visit.scored}</small>
              </div>
              <Button size="sm" variant="secondary" onClick={() => rewind(index)}>Rewind here</Button>
            </li>
          ))}
        </ol>
        <Button variant="secondary" onClick={() => setCorrection(false)}>Keep current score</Button>
      </div>
    </Modal>
  </div>;
}
