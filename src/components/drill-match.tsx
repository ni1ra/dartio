"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, CommandDock, IconButton, Surface } from "navi-ui";
import {
  appendDrillEvent,
  createDrillLog,
  drillDartEvent,
  drillMatchRecord,
  drillSummary,
  drillTarget,
  DRILLS,
  notation,
  replayDrill,
  undoLastDrillEvent,
  type Dart,
  type DrillId,
  type DrillLog,
} from "@/domain";
import { DartInputPad } from "./dart-input-pad";
import { Dartboard } from "./dartboard";
import { useMatchKeyboard } from "./use-match-keyboard";
import { useRecordMatch } from "./use-record-match";

/**
 * One screen for all three drills.
 *
 * They differ in what you aim at and what an attempt is worth, not in how an
 * attempt is played, so they share this the way the four round modes share theirs.
 * A drill is an attempt ledger rather than a game: nobody wins, and the number that
 * matters is how often you took what you aimed at.
 */
const STORAGE_PREFIX = "dartio:drill-log:v1:";

export function DrillMatch({ drill }: { drill: DrillId }) {
  const rules = DRILLS[drill];
  const key = `${STORAGE_PREFIX}${drill}`;
  const freshLog = useMemo(() => createDrillLog(drill), [drill]);
  const [log, setLog] = useState<DrillLog>(freshLog);
  const [resumed, setResumed] = useState(false);
  const [message, setMessage] = useState(rules.blurb);

  const game = useMemo(() => replayDrill(log).state, [log]);
  const summary = useMemo(() => drillSummary(game), [game]);
  const target = drillTarget(game);
  const finished = game.status === "complete";

  // Read on a later frame so the server and first client render match, the way
  // every other mode resumes.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem(key);
        if (!stored) return;
        const parsed: unknown = JSON.parse(stored);
        if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as DrillLog).events)) return;
        setLog({ drill, events: (parsed as DrillLog).events });
        setResumed(true);
      } catch { /* a drill that cannot be resumed simply starts again */ }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [drill, key]);

  useEffect(() => {
    if (log.events.length === 0) return;
    try { window.localStorage.setItem(key, JSON.stringify(log)); } catch { /* resume is optional */ }
  }, [log, key]);

  useEffect(() => {
    if (!finished) return;
    try { window.localStorage.removeItem(key); } catch { /* ignored */ }
  }, [finished, key]);

  const completedRecord = useMemo(() => (finished ? drillMatchRecord(log) : null), [finished, log]);
  useRecordMatch(completedRecord);

  function addDart(value: Dart) {
    if (finished) return;
    setLog((current) => appendDrillEvent(current, drillDartEvent(value)));
    setMessage(`${notation(value)} recorded`);
  }

  function undo() {
    if (log.events.length === 0) return;
    setLog((current) => undoLastDrillEvent(current));
    setMessage("Last dart taken back");
  }

  const keyboard = useMatchKeyboard({ onDart: addDart, onUndo: undo, disabled: finished });

  return <div className="page-frame drill-page">
    <header className="match-header">
      <div>
        <span className={finished ? "match-complete" : "match-live"}>{!finished && <i />} {finished ? "DRILL COMPLETE" : `ATTEMPT ${Math.min(summary.attempts + 1, rules.attempts)} OF ${rules.attempts}`}</span>
        <b>{rules.name}</b>
      </div>
      <div className="match-tools">
        <IconButton label="Undo last dart" onClick={undo} disabled={finished || log.events.length === 0}>↶</IconButton>
      </div>
    </header>

    {resumed && !finished && <div className="match-notice" role="status">Resumed the drill where you left off</div>}

    <section className="drill-readout" aria-label="Your run">
      <div className="drill-target">
        <span>{target === null ? "Anything counts" : drill === "doublesMatrix" ? "Double" : "Check out"}</span>
        <strong>{target === null ? "—" : target}</strong>
      </div>
      <dl className="drill-figures">
        <div><dt>Taken</dt><dd>{summary.hits}<small>of {summary.attempts}</small></dd></div>
        <div><dt>Rate</dt><dd>{summary.hitPercentage.toFixed(0)}%</dd></div>
        <div><dt>Total</dt><dd>{summary.total}<small>{summary.unit}</small></dd></div>
        <div><dt>Darts</dt><dd>{summary.dartsThrown}</dd></div>
      </dl>
    </section>

    <Dartboard darts={game.currentDarts} disabled={finished} onDart={addDart} />
    <DartInputPad disabled={finished} onDart={addDart} />

    {game.attempts.length > 0 && <ol className="drill-history">
      {[...game.attempts].reverse().slice(0, 8).map((attempt) => <li key={attempt.index} className={attempt.hit ? "took" : "missed"}>
        <span>{attempt.target === null ? `Visit ${attempt.index + 1}` : `${drill === "doublesMatrix" ? "D" : ""}${attempt.target}`}</span>
        <b>{attempt.darts.map(notation).join(" ") || "—"}</b>
        <small>{attempt.hit ? "took it" : "missed"}</small>
      </li>)}
    </ol>}

    {finished && <Surface className="drill-result">
      <h2>{rules.name} · {summary.hits} of {summary.attempts}</h2>
      <p>{summary.total} {summary.unit} from {summary.dartsThrown} darts. Signed in, this run is saved to your record.</p>
      <div className="account-actions">
        <Button onClick={() => { setLog(freshLog); setResumed(false); setMessage(rules.blurb); }}>Run it again</Button>
        <Link className="button-link button-link-secondary" href="/practice">Back to practice</Link>
      </div>
    </Surface>}

    <CommandDock className="match-dock">
      <span aria-live="polite">{finished ? "Drill complete." : message}</span>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{keyboard.announcement}</span>
      <div><Button variant="secondary" onClick={undo} disabled={finished || log.events.length === 0}>Undo</Button></div>
    </CommandDock>
  </div>;
}
