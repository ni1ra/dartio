"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, CommandDock, IconButton, Modal } from "navi-ui";
import {
  aiTactics, applyRoundDart,
  appendRoundEvent, chooseRoundAim, createRoundLog, notation, replayRound, rewindRoundToVisit, ROUND_MODES,
  liveRoundView, roundDartEvent, roundMatchRecord, undoLastRoundEvent,
  type Dart, type RoundLog, type RoundModeId,
} from "@/domain";
import { seededRandom, throwAiDart } from "@/domain/ai-throw";
import { requestPremiumAiThrow } from "@/lib/product/ai-throw-client";
import { collectAiVisit } from "@/lib/product/ai-visit";
import { opponentSeatIdentity } from "@/lib/product/ai-match-identity";
import { DartInputPad } from "./dart-input-pad";
import { Dartboard } from "./dartboard";
import { useAiVisit } from "./use-ai-visit";
import { useMatchKeyboard } from "./use-match-keyboard";
import { useRecordMatch } from "./use-record-match";
import { OpponentAiAccessBanner, useOpponentAiAccess } from "./opponent-ai-access";
import { describeAiFailure, describeAiRefresh, type AiRecovery } from "./opponent-ai-recovery";

const STORAGE_PREFIX = "dartio:round-log:v2:";
const STORAGE_VERSION = 1;

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
  const levelParam = params.get("level");
  const requestedLevel = levelParam === null || levelParam.trim() === "" ? Number.NaN : Number(levelParam);
  const selectedLevel = Number.isInteger(requestedLevel) ? Math.min(20, Math.max(1, requestedLevel)) : 5;
  const aiAccess = useOpponentAiAccess(isAi, selectedLevel);
  const restoreLevelEight = aiAccess.continueAtEight;
  const level = aiAccess.level;
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
  const [aiRecovery, setAiRecovery] = useState<AiRecovery | null>(null);
  const [aiLevelsUsed, setAiLevelsUsed] = useState<readonly number[]>([]);
  const retryGeneration = useRef(0);
  const { state: game } = useMemo(() => replayRound(log), [log]);
  // Local, AI, and each requested bot level are different match setups. Keeping
  // them in distinct slots prevents a local pair from resuming as an AI match or
  // a level-eight log from later being recorded as level twenty.
  const storageScope = solo ? "solo" : isAi ? `ai-${selectedLevel}` : "local";
  const key = `${STORAGE_PREFIX}${mode}:${storageScope}`;
  const legacyKey = `dartio:round-log:v1:${mode}:${solo ? "solo" : "pair"}`;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem(key);
        let stored: RoundLog;
        let continuedAtEight = false;
        let storedLevels: readonly number[] = [];
        if (raw) {
          const envelope = JSON.parse(raw) as {
            storageVersion?: unknown;
            continuedAtEight?: unknown;
            aiLevelsUsed?: unknown;
            log?: unknown;
          };
          if (
            envelope?.storageVersion !== STORAGE_VERSION
            || typeof envelope.continuedAtEight !== "boolean"
            || !Array.isArray(envelope.aiLevelsUsed)
            || envelope.aiLevelsUsed.some((level) => !Number.isInteger(level) || level < 1 || level > 20)
            || typeof envelope.log !== "object"
            || envelope.log === null
          ) return;
          stored = envelope.log as RoundLog;
          continuedAtEight = envelope.continuedAtEight;
          storedLevels = envelope.aiLevelsUsed as number[];
        } else {
          // Production's v1 `pair` key did not distinguish local from AI or
          // carry a level. Solo and a roster-proven local pair are safe to move;
          // an AI pair is intentionally not guessed into a v2 scope.
          if (isAi) return;
          const legacyRaw = window.localStorage.getItem(legacyKey);
          if (!legacyRaw) return;
          stored = JSON.parse(legacyRaw) as RoundLog;
          if (!solo && stored.players[1]?.name !== "Player 2") return;
        }
        if (stored.mode !== mode || !Array.isArray(stored.events) || stored.events.length === 0) return;
        if (stored.players.length !== freshLog.players.length) return;
        // Replaying the stored log is the validation: a corrupted one throws
        // here rather than resuming into a score that never happened.
        replayRound(stored);
        logRef.current = stored;
        setLog(stored);
        setAiLevelsUsed([...new Set(storedLevels)]);
        if (continuedAtEight) restoreLevelEight();
        setResumed(true);
        setMessage("Match resumed where you left off");
      } catch {
        window.localStorage.removeItem(key);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [key, legacyKey, mode, freshLog.players.length, restoreLevelEight, isAi, solo]);

  useEffect(() => {
    if (log.events.length === 0) return;
    try {
      window.localStorage.setItem(key, JSON.stringify({
        storageVersion: STORAGE_VERSION,
        continuedAtEight: aiAccess.continuedAtEight,
        aiLevelsUsed,
        log,
      }));
    } catch { /* resume is optional */ }
  }, [log, key, aiAccess.continuedAtEight, aiLevelsUsed]);
  useEffect(() => {
    if (game.status !== "complete") return;
    try {
      window.localStorage.removeItem(key);
      if (!isAi) window.localStorage.removeItem(legacyKey);
    } catch { /* ignored */ }
  }, [game.status, key, legacyKey, isAi]);
  // Seat one is the opponent's when one was asked for.
  const completedRecord = useMemo(
    () => (game.status === "complete"
      ? roundMatchRecord(log, [{}, opponentSeatIdentity(isAi, level, aiLevelsUsed)])
      : null),
    [game.status, log, isAi, level, aiLevelsUsed],
  );
  useRecordMatch(completedRecord);

  const disabled = game.status === "complete"
    || (isAi && game.currentPlayer !== 0)
    || aiAccess.accessChecking;
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

  const aiVisit = useAiVisit<{ readonly darts: readonly Dart[]; readonly level: number }>({
    ready: isAi
      && game.status === "playing"
      && game.currentPlayer === 1
      && !aiAccess.accessChecking
      && aiRecovery === null
      && !correction,
    revision: log.events.length,
    generate: async (signal) => {
      const current = replayRound(logRef.current).state;
      const executionLevel = aiAccess.level;
      const premium = aiAccess.premiumReady;
      const tactics = aiTactics(executionLevel);
      const random = seededRandom(current.visits.length * 101 + executionLevel);
      setMessage(premium
        ? `AI level ${executionLevel} is calculating on Dartio…`
        : `AI level ${executionLevel} is at the oche…`);
      const darts = await collectAiVisit({
        initial: current,
        signal,
        rules: {
          continues: (state) => state.status === "playing" && state.currentPlayer === 1,
          boundary: (state) => state.visits.length,
          target: (state) => chooseRoundAim(state, 1, tactics, state.currentDarts),
          apply: applyRoundDart,
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
    const undone = undoLastRoundEvent(logRef.current);
    logRef.current = undone;
    setLog(undone);
    setMessage("Last entry removed");
  }
  function rewind(visitIndex: number) {
    cancelPendingAi();
    setAiRecovery(null);
    const rewound = rewindRoundToVisit(logRef.current, visitIndex);
    const dropped = logRef.current.events.length - rewound.events.length;
    // The ref moves with the state, or the opponent folds over the pre-correction log.
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
        <span>{solo ? "Solo practice" : isAi ? `AI level ${level}` : "Local match"}</span>
        <IconButton label="Correct a visit" onClick={openCorrection} disabled={game.status === "complete" || game.visits.length === 0}>✎</IconButton>
        <IconButton label="Undo last dart" onClick={undo} disabled={game.status === "complete" || log.events.length === 0}>↶</IconButton>
      </div>
    </header>

    {resumed && <div className="match-notice" role="status">
      Resumed the match that was in progress on this device.
      <button type="button" onClick={() => setResumed(false)}>Dismiss</button>
    </div>}
    <OpponentAiAccessBanner access={aiAccess} />
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
      <div className={aiRecovery ? "ai-access-actions" : undefined}>
        {aiRecovery && <>
          <span className="ai-access-recovery" role="alert">{aiRecovery.message}</span>
          <button onClick={() => void retryPremiumAi()} disabled={aiAccess.accessChecking}>{aiRecovery.kind === "denied" ? "Check again" : "Retry"}</button>
          <button onClick={continueWithLevelEight}>Continue at level 8</button>
        </>}
        <button onClick={undo} disabled={game.status === "complete" || log.events.length === 0}>Undo</button>
        <button onClick={openCorrection} disabled={game.status === "complete" || game.visits.length === 0}>Correct a visit</button>
      </div>
    </CommandDock>

    <Modal open={correction} onClose={closeCorrection} title="Correct a visit">
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
        <Button variant="secondary" onClick={closeCorrection}>Keep current score</Button>
      </div>
    </Modal>
  </div>;
}
