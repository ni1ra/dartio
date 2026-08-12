"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, CommandDock, IconButton, Modal } from "navi-ui";
import {
  aiTactics, applyCricketDart,
  appendCricketEvent, chooseCricketAim, createCricketLog, CRICKET_NUMBERS, cricketDartEvent, cricketMatchRecord,
  cricketPlayerStats,
  dart, dartMarks, hasClosed, isCricketNumber, notation, replayCricket, rewindCricketToVisit,
  undoLastCricketEvent,
  type CricketLog, type CricketOptions, type CricketVariant, type Dart,
} from "@/domain";
import { seededRandom, throwAiDart } from "@/domain/ai-throw";
import { requestPremiumAiThrow } from "@/lib/product/ai-throw-client";
import { collectAiVisit } from "@/lib/product/ai-visit";
import { opponentSeatIdentity } from "@/lib/product/ai-match-identity";
import { clearCricketMatch, loadCricketMatch, matchesCricketSetup, saveCricketMatch } from "@/lib/product/cricket-store";
import { DartInputPad } from "./dart-input-pad";
import { Dartboard } from "./dartboard";
import { useAiVisit } from "./use-ai-visit";
import { useMatchKeyboard } from "./use-match-keyboard";
import { useRecordMatch } from "./use-record-match";
import { OpponentAiAccessBanner, useOpponentAiAccess } from "./opponent-ai-access";
import { describeAiFailure, describeAiRefresh, type AiRecovery } from "./opponent-ai-recovery";
import { useScreenWakeLock } from "./use-screen-wake-lock";
import { VoiceControl } from "./voice-control";

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
  const levelParam = params.get("level");
  const requestedLevel = levelParam === null || levelParam.trim() === "" ? Number.NaN : Number(levelParam);
  const selectedLevel = Number.isInteger(requestedLevel) ? Math.min(20, Math.max(1, requestedLevel)) : 5;
  const storageScope = isAi ? `ai-${selectedLevel}` : "local";
  const aiAccess = useOpponentAiAccess(isAi, selectedLevel);
  const restoreLevelEight = aiAccess.continueAtEight;
  const level = aiAccess.level;

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
  const [aiRecovery, setAiRecovery] = useState<AiRecovery | null>(null);
  const [aiLevelsUsed, setAiLevelsUsed] = useState<readonly number[]>([]);
  const retryGeneration = useRef(0);
  const { state: game } = useMemo(() => replayCricket(log), [log]);
  useScreenWakeLock(game.status === "playing");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = loadCricketMatch(storageScope);
      if (!stored || stored.log.events.length === 0 || !matchesCricketSetup(stored.log, freshLog)) return;
      logRef.current = stored.log;
      setLog(stored.log);
      setAiLevelsUsed(stored.aiLevelsUsed);
      if (stored.continuedAtEight) restoreLevelEight();
      setResumed(true);
      setMessage("Match resumed where you left off");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [freshLog, storageScope, restoreLevelEight]);
  useEffect(() => {
    if (log.events.length > 0) {
      saveCricketMatch(log, storageScope, aiAccess.continuedAtEight, aiLevelsUsed);
    }
  }, [log, storageScope, aiAccess.continuedAtEight, aiLevelsUsed]);
  useEffect(() => {
    if (game.status === "complete") clearCricketMatch(storageScope);
  }, [game.status, storageScope]);
  // Seat one is the opponent's when there is one; the log records what was thrown,
  // never who threw it, so that is supplied here.
  const completedRecord = useMemo(
    () => (game.status === "complete"
      ? cricketMatchRecord(log, [{}, opponentSeatIdentity(isAi, level, aiLevelsUsed)])
      : null),
    [game.status, log, isAi, level, aiLevelsUsed],
  );
  useRecordMatch(completedRecord);

  const disabled = game.status === "complete"
    || (isAi && game.currentPlayer !== 0)
    || aiAccess.accessChecking;

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

  const aiVisit = useAiVisit<{ readonly darts: readonly Dart[]; readonly level: number }>({
    ready: isAi
      && game.status === "playing"
      && game.currentPlayer === 1
      && !aiAccess.accessChecking
      && aiRecovery === null
      && !correction,
    revision: log.events.length,
    generate: async (signal) => {
      const current = replayCricket(logRef.current).state;
      const executionLevel = aiAccess.level;
      const premium = aiAccess.premiumReady;
      const tactics = aiTactics(executionLevel);
      const random = seededRandom(current.turns.length * 101 + executionLevel);
      setMessage(premium
        ? `AI level ${executionLevel} is calculating on Dartio…`
        : `AI level ${executionLevel} is at the oche…`);
      const darts = await collectAiVisit({
        initial: current,
        signal,
        rules: {
          continues: (state) => state.status === "playing" && state.currentPlayer === 1,
          boundary: (state) => state.turns.length,
          target: (state) => chooseCricketAim(state, 1, tactics),
          apply: applyCricketDart,
        },
        sample: premium
          ? (target, currentSignal) => requestPremiumAiThrow(
            { level: executionLevel, target },
            { signal: currentSignal },
          )
          : async (target) => throwAiDart(executionLevel, target, random).dart,
      });
      return { darts, level: executionLevel };
    },
    commit: (visit) => {
      setAiRecovery(null);
      setAiLevelsUsed((current) => current.includes(visit.level) ? current : [...current, visit.level]);
      if (aiAccess.premiumRequested && visit.level === 8) aiAccess.continueAtEight();
      commit(visit.darts);
      setMessage("Your throw · 3 darts");
    },
    fail: (problem) => {
      const recovery = describeAiFailure(problem);
      setAiRecovery(recovery);
      setMessage(recovery.announcement);
    },
  });
  useEffect(() => () => { retryGeneration.current += 1; }, []);
  function cancelPendingAi() {
    retryGeneration.current += 1;
    aiVisit.cancel();
  }
  function undo() {
    cancelPendingAi();
    setAiRecovery(null);
    if (logRef.current.events.length === 0) return;
    const undone = undoLastCricketEvent(logRef.current);
    logRef.current = undone;
    setLog(undone);
    setMessage("Last entry removed");
  }
  function rewind(visitIndex: number) {
    cancelPendingAi();
    setAiRecovery(null);
    const rewound = rewindCricketToVisit(logRef.current, visitIndex);
    const dropped = logRef.current.events.length - rewound.events.length;
    // The ref moves with the state, or the opponent's next visit folds over the
    // log as it was before the correction.
    logRef.current = rewound;
    setLog(rewound);
    setCorrection(false);
    setMessage(`Rewound ${dropped} ${dropped === 1 ? "entry" : "entries"} · throw the visit again`);
  }
  function openCorrection() {
    cancelPendingAi();
    setAiRecovery(null);
    setCorrection(true);
    setMessage("AI paused while you review the match");
  }
  function closeCorrection() {
    setCorrection(false);
  }
  async function retryPremiumAi() {
    if (!isAi || game.status !== "playing" || game.currentPlayer !== 1 || !aiRecovery) return;
    const attempt = ++retryGeneration.current;
    const result = aiRecovery.kind === "denied" || !aiAccess.premiumReady
      ? await aiAccess.refresh()
      : "ready";
    if (attempt !== retryGeneration.current) return;
    const recovery = describeAiRefresh(result);
    if (recovery) {
      setAiRecovery(recovery);
      setMessage(recovery.announcement);
      return;
    }
    setAiRecovery(null);
    aiVisit.retry();
  }
  function continueWithLevelEight() {
    cancelPendingAi();
    aiAccess.continueAtEight();
    setAiRecovery(null);
    setMessage("Continuing this match with AI level 8");
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
        <span>{isAi ? `AI level ${level}` : "Local match"}</span>
        <IconButton label="Correct a visit" onClick={openCorrection} disabled={game.status === "complete" || game.turns.length === 0}>✎</IconButton>
        <IconButton label="Undo last dart" onClick={undo} disabled={game.status === "complete" || log.events.length === 0}>↶</IconButton>
      </div>
    </header>

    {resumed && <div className="match-notice" role="status">
      Resumed the match that was in progress on this device.
      <button type="button" onClick={() => setResumed(false)}>Dismiss</button>
    </div>}

    <OpponentAiAccessBanner access={aiAccess} />

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
        <VoiceControl
          revision={log.events.length}
          disabled={disabled || correction}
          mode="cricket"
          onDart={(segment, multiplier) => addDart(dart(segment as Dart["segment"], multiplier))}
          onTurnScore={() => undefined}
          onUndo={undo}
          onNextPlayer={() => setMessage("Record every dart before ending the visit")}
        />
      </aside>
    </div>

    <CommandDock className="match-dock">
      <span aria-live="polite">{message}</span>
      {keyboard.pending !== "" && <span className="keyboard-buffer" aria-hidden="true">{keyboard.pending} · Enter single · D double · T treble</span>}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{keyboard.announcement}</span>
      <div className={aiRecovery ? "ai-access-actions" : undefined}>
        {aiRecovery && <>
          <span className="ai-access-recovery" role="alert">{aiRecovery.message}</span>
          <button onClick={() => void retryPremiumAi()} disabled={aiAccess.accessChecking}>{aiRecovery.kind === "denied" ? "Check again" : "Retry"}</button>
          <button onClick={continueWithLevelEight}>Continue at level 8</button>
        </>}
        <button onClick={undo} disabled={game.status === "complete" || log.events.length === 0}>Undo</button>
        <button onClick={openCorrection} disabled={game.status === "complete" || game.turns.length === 0}>Correct a visit</button>
      </div>
    </CommandDock>

    <Modal open={correction} onClose={closeCorrection} title="Correct a visit">
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
        <Button variant="secondary" onClick={closeCorrection}>Keep current score</Button>
      </div>
    </Modal>
  </div>;
}
