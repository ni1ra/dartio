"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, CommandDock, IconButton, Modal } from "navi-ui";
import {
  aiTactics, applyCricketDart,
  appendCricketEvent, chooseCricketAim, createCricketLog, CRICKET_NUMBERS, cricketDartEvent, cricketMatchRecord,
  cricketPlayerStats,
  dartMarks, hasClosed, isCricketNumber, notation, replayCricket, rewindCricketToVisit, seededRandom, throwAiDart,
  undoLastCricketEvent,
  type CricketLog, type CricketOptions, type CricketState, type CricketVariant, type Dart,
} from "@/domain";
import { clearCricketMatch, loadCricketMatch, matchesCricketSetup, saveCricketMatch } from "@/lib/product/cricket-store";
import { DartInputPad } from "./dart-input-pad";
import { Dartboard } from "./dartboard";
import { useAiVisit } from "./use-ai-visit";
import { useMatchKeyboard } from "./use-match-keyboard";
import { useRecordMatch } from "./use-record-match";

/**
 * Plays out one opponent visit and returns the darts, not the resulting state.
 *
 * Everything that scores reaches the match as events, so a corrected or resumed
 * game replays the opponent's throws exactly as it replays the player's. The seed
 * comes from the completed-visit count, so the same log always produces the same
 * visit.
 *
 * Levels stop at eight because that is exactly the free tier. Nine to twenty are
 * server-authorized for X01, and the route that authorizes them speaks X01 —
 * extending it would mean teaching the server Cricket's rules, which is the one
 * thing the architecture is built to avoid.
 */
function cricketAiDarts(state: CricketState, level: number): readonly Dart[] {
  const rng = seededRandom(state.turns.length * 101 + level);
  const tactics = aiTactics(level);
  let next = state;
  const thrown: Dart[] = [];
  while (next.status === "playing" && next.currentPlayer === 1) {
    const value = throwAiDart(level, chooseCricketAim(next, 1, tactics), rng).dart;
    thrown.push(value);
    next = applyCricketDart(next, value);
  }
  return thrown;
}

const VARIANTS: readonly CricketVariant[] = ["standard", "cut-throat", "tactics"];
const VARIANT_LABEL: Record<CricketVariant, string> = {
  standard: "Standard",
  "cut-throat": "Cut-throat",
  tactics: "Tactics",
};

/** Marks render as the scorer's shorthand: slash, cross, then circled. */
function markGlyph(count: number): string {
  return count >= 3 ? "⊗" : count === 2 ? "✕" : count === 1 ? "╱" : "";
}

export function CricketMatch() {
  const params = useSearchParams();
  const variantParam = params.get("variant");
  const variant: CricketVariant = VARIANTS.includes(variantParam as CricketVariant)
    ? variantParam as CricketVariant
    : "standard";
  const winByTwo = params.get("winByTwo") === "true";
  const roundParam = Number(params.get("rounds"));
  const roundLimit = Number.isInteger(roundParam) && roundParam >= 1 && roundParam <= 99 ? roundParam : null;

  const isAi = params.get("opponent") === "ai";
  const requestedLevel = Number(params.get("level"));
  const level = Number.isInteger(requestedLevel) ? Math.min(8, Math.max(1, requestedLevel)) : 5;

  const options = useMemo<CricketOptions>(() => ({ variant, winByTwo, roundLimit }), [variant, winByTwo, roundLimit]);
  const freshLog = useMemo(
    () => createCricketLog(options, [{ id: "you", name: "Player 1" }, { id: "them", name: isAi ? "The Navigator" : "Player 2" }]),
    [options, isAi],
  );

  const [log, setLog] = useState<CricketLog>(freshLog);
  /*
   * The authoritative log, readable synchronously. The opponent commits from
   * inside a timer whose closure was created a visit earlier, so it must fold over
   * what has actually happened rather than over what it captured — the mistake
   * that once had X01's AI playing the entire match by itself.
   */
  const logRef = useRef<CricketLog>(freshLog);
  const [resumed, setResumed] = useState(false);
  const [correction, setCorrection] = useState(false);
  const [message, setMessage] = useState("Your throw · 3 darts");
  const { state: game } = useMemo(() => replayCricket(log), [log]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = loadCricketMatch();
      if (!stored || stored.events.length === 0 || !matchesCricketSetup(stored, freshLog)) return;
      logRef.current = stored;
      setLog(stored);
      setResumed(true);
      setMessage("Match resumed where you left off");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [freshLog]);
  useEffect(() => { if (log.events.length > 0) saveCricketMatch(log); }, [log]);
  useEffect(() => { if (game.status === "complete") clearCricketMatch(); }, [game.status]);
  // Seat one is the opponent's when there is one; the log records what was thrown,
  // never who threw it, so that is supplied here.
  const completedRecord = useMemo(
    () => (game.status === "complete" ? cricketMatchRecord(log, [{}, { isBot: isAi, ...(isAi ? { botLevel: level } : {}) }]) : null),
    [game.status, log, isAi, level],
  );
  useRecordMatch(completedRecord);

  const disabled = game.status === "complete" || (isAi && game.currentPlayer !== 0);

  function commit(darts: readonly Dart[]) {
    if (darts.length === 0) return;
    const appended = darts.reduce((current, value) => appendCricketEvent(current, cricketDartEvent(value)), logRef.current);
    logRef.current = appended;
    setLog(appended);
  }

  function addDart(value: Dart) {
    if (disabled) return;
    commit([value]);
    const marks = dartMarks(value);
    setMessage(isCricketNumber(value.segment)
      ? `${notation(value)} · ${marks} mark${marks === 1 ? "" : "s"}`
      : `${notation(value)} · no mark`);
  }

  useAiVisit({
    ready: isAi && game.status === "playing" && game.currentPlayer === 1,
    play: () => {
      const current = replayCricket(logRef.current).state;
      if (current.status !== "playing" || current.currentPlayer !== 1) return;
      commit(cricketAiDarts(current, level));
      setMessage("Your throw · 3 darts");
    },
  });
  function undo() {
    if (log.events.length === 0) return;
    const undone = undoLastCricketEvent(log);
    logRef.current = undone;
    setLog(undone);
    setMessage("Last entry removed");
  }
  function rewind(visitIndex: number) {
    const rewound = rewindCricketToVisit(log, visitIndex);
    const dropped = log.events.length - rewound.events.length;
    // The ref moves with the state, or the opponent's next visit folds over the
    // log as it was before the correction.
    logRef.current = rewound;
    setLog(rewound);
    setCorrection(false);
    setMessage(`Rewound ${dropped} ${dropped === 1 ? "entry" : "entries"} · throw the visit again`);
  }

  const keyboard = useMatchKeyboard({ onDart: addDart, onUndo: undo, disabled });
  const stats = game.players.map((player) => cricketPlayerStats(game, player.id));
  const winner = game.players.find((player) => player.id === game.winnerId);

  return <div className="match-page cricket-page" data-input-mode="darts">
    <header className="match-header">
      <div>
        <span className={game.status === "playing" ? "match-live" : "match-complete"}>
          {game.status === "playing" && <i />} {game.status === "playing" ? `ROUND ${game.round} · LIVE` : "MATCH COMPLETE"}
        </span>
        <b>Cricket · {VARIANT_LABEL[variant]}{roundLimit === null ? "" : ` · ${roundLimit} rounds`}</b>
      </div>
      <div className="match-tools">
        <IconButton label="Correct a visit" onClick={() => setCorrection(true)} disabled={disabled || game.turns.length === 0}>✎</IconButton>
        <IconButton label="Undo last dart" onClick={undo} disabled={disabled || log.events.length === 0}>↶</IconButton>
      </div>
    </header>

    {resumed && <div className="match-notice" role="status">
      Resumed the match that was in progress on this device.
      <button type="button" onClick={() => setResumed(false)}>Dismiss</button>
    </div>}

    {winner && <div className="match-notice" role="status">{winner.name} wins the match.</div>}

    <section className="cricket-board" aria-label="Cricket scoreboard">
      <table>
        <caption className="sr-only">Marks and points by number</caption>
        <thead>
          <tr>
            <th scope="col">{game.players[0]?.name}</th>
            <th scope="col">Number</th>
            <th scope="col">{game.players[1]?.name}</th>
          </tr>
        </thead>
        <tbody>
          {CRICKET_NUMBERS.map((target, index) => (
            <tr key={target} className={hasClosed(game, 0, target) && hasClosed(game, 1, target) ? "dead" : ""}>
              <td aria-label={`${game.players[0]?.name}: ${game.marks[0]?.[index] ?? 0} marks on ${target === 25 ? "bull" : target}`}>
                {markGlyph(game.marks[0]?.[index] ?? 0)}
              </td>
              <th scope="row">{target === 25 ? "BULL" : target}</th>
              <td aria-label={`${game.players[1]?.name}: ${game.marks[1]?.[index] ?? 0} marks on ${target === 25 ? "bull" : target}`}>
                {markGlyph(game.marks[1]?.[index] ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>{game.points[0]}</strong></td>
            <th scope="row">{variant === "tactics" ? "MARKS" : "POINTS"}</th>
            <td><strong>{game.points[1]}</strong></td>
          </tr>
        </tfoot>
      </table>
      <p className="cricket-turn">
        <span className={game.currentPlayer === 0 ? "active" : ""}>{game.players[0]?.name}</span>
        <i>{3 - game.currentDarts.length} darts</i>
        <span className={game.currentPlayer === 1 ? "active" : ""}>{game.players[1]?.name}</span>
      </p>
      <p className="cricket-rates">
        {stats.map((value, index) => (
          <span key={value.playerId}>
            {game.players[index]?.name}: {value.marksPerRound.toFixed(2)} MPR
          </span>
        ))}
      </p>
    </section>

    <div className="match-grid cricket-grid">
      <section className="board-zone">
        <Dartboard disabled={disabled} onDart={addDart} darts={game.currentDarts} />
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
        <button onClick={() => setCorrection(true)} disabled={disabled || game.turns.length === 0}>Correct a visit</button>
      </div>
    </CommandDock>

    <Modal open={correction} onClose={() => setCorrection(false)} title="Correct a visit">
      <div className="correction-body">
        <p>Pick the visit that was recorded wrongly. The match rewinds to just before it, and you throw it again from there.</p>
        <ol className="correction-visits">
          {game.turns.map((turn, index) => (
            <li key={`${turn.round}-${index}`}>
              <div>
                <span>{game.players.find((player) => player.id === turn.playerId)?.name ?? "Player"}</span>
                <b>{turn.darts.map(notation).join(" ") || "—"}</b>
                <small>ROUND {turn.round} · {turn.marksScored} marks{turn.pointsScored > 0 ? ` · ${turn.pointsScored} points` : ""}</small>
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
