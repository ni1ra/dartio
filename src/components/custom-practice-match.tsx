"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, CommandDock, IconButton, Surface } from "navi-ui";
import {
  appendCustomPracticeEvent,
  createCustomPracticeLog,
  customPracticeDartEvent,
  customPracticeMatchRecord,
  customPracticeSummary,
  customPracticeTarget,
  dart,
  encodeCustomPracticePath,
  notation,
  practiceTargetNotation,
  replayCustomPractice,
  undoLastCustomPracticeEvent,
  type CustomPracticeLog,
  type Dart,
  type PracticeTarget,
} from "@/domain";
import { hasAccessEntitlement, isProductAvailable } from "@/lib/product/access-contract";
import { clearCustomPractice, loadCustomPractice, saveCustomPractice } from "@/lib/product/custom-practice-store";
import { useAccess } from "./access-provider";
import { DartInputPad } from "./dart-input-pad";
import { Dartboard } from "./dartboard";
import { useMatchKeyboard } from "./use-match-keyboard";
import { useRecordMatch } from "./use-record-match";
import { useScreenWakeLock } from "./use-screen-wake-lock";
import { VoiceControl } from "./voice-control";

export function CustomPracticeMatch({ targets }: { readonly targets: readonly PracticeTarget[] }) {
  const access = useAccess();
  const path = useMemo(() => encodeCustomPracticePath(targets), [targets]);
  const freshLog = useMemo(() => createCustomPracticeLog(targets), [targets]);
  const [log, setLog] = useState<CustomPracticeLog>(freshLog);
  const [hydratedPath, setHydratedPath] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  const [message, setMessage] = useState("Your first target is waiting");
  const persistence = useRef<{ readonly path: string; priorEventCount: number } | null>(null);
  const eligible = access.status === "ready"
    && isProductAvailable(access.snapshot, "customPractice")
    && hasAccessEntitlement(access.snapshot, "custom_practice");
  const game = useMemo(() => replayCustomPractice(log).state, [log]);
  const summary = useMemo(() => customPracticeSummary(game), [game]);
  const target = customPracticeTarget(game);
  const hydrated = hydratedPath === path;
  const finished = game.status === "complete";
  const disabled = !eligible || !hydrated || finished;
  useScreenWakeLock(eligible && hydrated && !finished);

  useEffect(() => {
    if (!eligible) return;
    const hydrate = () => {
      const stored = loadCustomPractice(targets);
      const next = stored ?? freshLog;
      setLog(next);
      setResumed(stored !== null);
      setMessage(stored ? "Custom path resumed where you left off" : "Your first target is waiting");
      persistence.current = { path, priorEventCount: next.events.length };
      setHydratedPath(path);
    };
    const frame = window.requestAnimationFrame(hydrate);
    return () => window.cancelAnimationFrame(frame);
  }, [eligible, freshLog, path, targets]);

  useEffect(() => {
    const state = persistence.current;
    if (!state || state.path !== path || !hydrated) return;
    if (log.events.length > 0) saveCustomPractice(log);
    else if (state.priorEventCount > 0) clearCustomPractice(targets);
    state.priorEventCount = log.events.length;
  }, [hydrated, log, path, targets]);

  useEffect(() => {
    if (eligible && hydrated && finished) clearCustomPractice(targets);
  }, [eligible, finished, hydrated, targets]);

  const completedRecord = useMemo(
    () => eligible && hydrated && finished ? customPracticeMatchRecord(log) : null,
    [eligible, finished, hydrated, log],
  );
  useRecordMatch(completedRecord);

  function addDart(value: Dart) {
    if (disabled) return;
    setLog((current) => appendCustomPracticeEvent(current, customPracticeDartEvent(value)));
    setMessage(`${notation(value)} recorded`);
  }

  function undo() {
    if (disabled || log.events.length === 0) return;
    setLog((current) => undoLastCustomPracticeEvent(current));
    setMessage("Last dart taken back");
  }

  const keyboard = useMatchKeyboard({ onDart: addDart, onUndo: undo, disabled });

  if (access.status === "loading") return <PracticeGate title="Checking your path…" body="Dartio is verifying custom-practice access." />;
  if (access.status === "unavailable") return <PracticeGate
    title="Membership authority is unavailable."
    body="The path and any saved darts on this device are untouched."
    action={<Button onClick={() => void access.retry()} disabled={access.refreshing}>{access.refreshing ? "Retrying…" : "Retry access"}</Button>}
  />;
  if (!eligible) return <PracticeGate
    title="This custom path needs Pro."
    body="Nothing was recorded or cleared. The fixed practice modes remain available."
    action={<Link className="button-link" href="/pricing">View Pro</Link>}
  />;

  return <div className="page-frame drill-page custom-practice-match">
    <header className="match-header">
      <div>
        <span className={finished ? "match-complete" : "match-live"}>{!finished && <i />} {finished ? "PATH COMPLETE" : `TARGET ${Math.min(summary.attempts + 1, targets.length)} OF ${targets.length}`}</span>
        <b>Custom practice</b>
      </div>
      <div className="match-tools"><IconButton label="Undo last dart" onClick={undo} disabled={disabled || log.events.length === 0}>↶</IconButton></div>
    </header>

    {resumed && !finished && <div className="match-notice" role="status">Resumed your exact {path.replaceAll(".", " · ")} path</div>}
    <section className="drill-readout" aria-label="Your custom path">
      <div className="drill-target"><span>Hit this bed</span><strong>{target ? practiceTargetNotation(target) : "—"}</strong></div>
      <dl className="drill-figures">
        <div><dt>Taken</dt><dd>{summary.hits}<small>of {summary.attempts}</small></dd></div>
        <div><dt>Rate</dt><dd>{summary.hitPercentage.toFixed(0)}%</dd></div>
        <div><dt>Path</dt><dd>{summary.attempts}<small>of {targets.length}</small></dd></div>
        <div><dt>Darts</dt><dd>{summary.dartsThrown}</dd></div>
      </dl>
    </section>

    <Dartboard darts={game.currentDarts} disabled={disabled} onDart={addDart} />
    <DartInputPad disabled={disabled} onDart={addDart} />
    <VoiceControl revision={log.events.length} disabled={disabled} mode="drill" onDart={(segment, multiplier) => addDart(dart(segment as Dart["segment"], multiplier))} onTurnScore={() => undefined} onUndo={undo} onNextPlayer={() => undefined} />

    {game.attempts.length > 0 && <ol className="drill-history">
      {[...game.attempts].reverse().map((attempt) => <li key={attempt.index} className={attempt.hit ? "took" : "missed"}>
        <span>{practiceTargetNotation(attempt.target)}</span>
        <b>{attempt.darts.map(notation).join(" ")}</b>
        <small>{attempt.hit ? "took it" : "missed"}</small>
      </li>)}
    </ol>}

    {finished && <Surface className="drill-result">
      <h2>{summary.hits} of {targets.length} beds taken</h2>
      <p>{summary.dartsThrown} darts across {path.replaceAll(".", " · ")}. Signed in, this custom-practice session is saved separately from competitive matches.</p>
      <div className="account-actions">
        <a className="button-link" href={`/play/match?custom=${path}`}>Run this path again</a>
        <Link className="button-link button-link-secondary" href="/practice">Build another path</Link>
      </div>
    </Surface>}

    <CommandDock className="match-dock">
      <span aria-live="polite">{finished ? "Custom path complete." : message}</span>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{keyboard.announcement}</span>
      <div><Button variant="secondary" onClick={undo} disabled={disabled || log.events.length === 0}>Undo</Button></div>
    </CommandDock>
  </div>;
}

function PracticeGate({ title, body, action }: {
  readonly title: string;
  readonly body: string;
  readonly action?: React.ReactNode;
}) {
  return <div className="page-frame custom-practice-gate"><Surface tone="raised">
    <p className="eyebrow">Custom practice</p><h1>{title}</h1><p>{body}</p>
    <div className="account-actions">{action}<Link className="button-link button-link-secondary" href="/practice">Back to practice</Link></div>
  </Surface></div>;
}
