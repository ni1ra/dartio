"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, CommandDock, IconButton, Modal } from "navi-ui";
import {
  appendCricketEvent, createCricketLog, CRICKET_NUMBERS, cricketDartEvent, cricketPlayerStats,
  dartMarks, hasClosed, isCricketNumber, notation, replayCricket, rewindCricketToVisit,
  undoLastCricketEvent,
  type CricketLog, type CricketOptions, type CricketVariant, type Dart,
} from "@/domain";
import { clearCricketMatch, loadCricketMatch, matchesCricketSetup, saveCricketMatch } from "@/lib/product/cricket-store";
import { DartInputPad } from "./dart-input-pad";
import { Dartboard } from "./dartboard";
import { useMatchKeyboard } from "./use-match-keyboard";

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

  const options = useMemo<CricketOptions>(() => ({ variant, winByTwo, roundLimit }), [variant, winByTwo, roundLimit]);
  const freshLog = useMemo(
    () => createCricketLog(options, [{ id: "you", name: "Player 1" }, { id: "them", name: "Player 2" }]),
    [options],
  );

  const [log, setLog] = useState<CricketLog>(freshLog);
  const [resumed, setResumed] = useState(false);
  const [correction, setCorrection] = useState(false);
  const [message, setMessage] = useState("Your throw · 3 darts");
  const { state: game } = useMemo(() => replayCricket(log), [log]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = loadCricketMatch();
      if (!stored || stored.events.length === 0 || !matchesCricketSetup(stored, freshLog)) return;
      setLog(stored);
      setResumed(true);
      setMessage("Match resumed where you left off");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [freshLog]);
  useEffect(() => { if (log.events.length > 0) saveCricketMatch(log); }, [log]);
  useEffect(() => { if (game.status === "complete") clearCricketMatch(); }, [game.status]);

  const disabled = game.status === "complete";

  function addDart(value: Dart) {
    if (disabled) return;
    setLog((current) => appendCricketEvent(current, cricketDartEvent(value)));
    const marks = dartMarks(value);
    setMessage(isCricketNumber(value.segment)
      ? `${notation(value)} · ${marks} mark${marks === 1 ? "" : "s"}`
      : `${notation(value)} · no mark`);
  }
  function undo() {
    if (log.events.length === 0) return;
    setLog(undoLastCricketEvent(log));
    setMessage("Last entry removed");
  }
  function rewind(visitIndex: number) {
    const rewound = rewindCricketToVisit(log, visitIndex);
    const dropped = log.events.length - rewound.events.length;
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
        <IconButton label="Correct a visit" onClick={() => setCorrection(true)} disabled={game.turns.length === 0}>✎</IconButton>
        <IconButton label="Undo last dart" onClick={undo} disabled={log.events.length === 0}>↶</IconButton>
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
        <button onClick={undo} disabled={log.events.length === 0}>Undo</button>
        <button onClick={() => setCorrection(true)} disabled={game.turns.length === 0}>Correct a visit</button>
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
