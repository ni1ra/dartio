"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Surface } from "navi-ui";
import { dart, type BoardNumber, type Dart } from "@/domain/darts";
import {
  buildMatchReplayTimeline,
  type MatchReplayDetail,
  type MatchReplayFrame,
} from "@/domain/match-replay";
import { modeName } from "@/domain/modes";
import { fetchMatchReplay } from "@/lib/product/match-history-client";
import { Dartboard } from "./dartboard";

type ReplayLoad = { readonly status: "loading" } | Awaited<ReturnType<typeof fetchMatchReplay>>;

/** Loads one owner-protected record and gives every terminal response its own honest surface. */
export function MatchReplay({ matchId }: { readonly matchId: string }) {
  const [load, setLoad] = useState<ReplayLoad>({ status: "loading" });
  const [request, setRequest] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchMatchReplay(matchId, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setLoad(result);
    });
    return () => controller.abort();
  }, [matchId, request]);

  function retry() {
    setLoad({ status: "loading" });
    setRequest((value) => value + 1);
  }

  return <div className="page-frame replay-page">
    <header className="page-heading replay-heading">
      <div>
        <p className="eyebrow">Your recorded match</p>
        <h1>Every dart.<br /><em>Nothing invented.</em></h1>
      </div>
      <p>Dartio rebuilds the stored visit log through one replay path for every mode. If a visit was entered only as a total, the board stays empty rather than guessing where its darts landed.</p>
    </header>
    {load.status === "loading" && <ReplayState state="loading" />}
    {load.status === "signed-out" && <ReplayState state="signed-out" />}
    {load.status === "not-found" && <ReplayState state="not-found" />}
    {load.status === "unavailable" && <ReplayState state="unavailable" retry={retry} />}
    {load.status === "ready" && <ReplayReady key={load.match.id} match={load.match} />}
  </div>;
}

function ReplayState({ state, retry }: {
  readonly state: "loading" | "signed-out" | "not-found" | "unavailable";
  readonly retry?: () => void;
}) {
  if (state === "loading") {
    return <Surface className="replay-state" aria-busy="true">
      <span className="replay-state-code">REPLAY / LOADING</span>
      <div><h2>Reading the stored visits…</h2><p role="status">The board will appear when the owner-protected record is ready.</p></div>
    </Surface>;
  }

  const content = state === "signed-out"
    ? { code: "REPLAY / SIGN IN", title: "This record belongs behind your account.", body: "Sign in with the account that recorded the match, then open it again." }
    : state === "not-found"
      ? { code: "REPLAY / NOT FOUND", title: "That replay is not in your record.", body: "It may have been removed, or it may belong to another account. Dartio gives both cases the same private answer." }
      : { code: "REPLAY / UNAVAILABLE", title: "The record could not be read just now.", body: "Nothing was changed. Retry the read, or return to your account while the service recovers." };

  return <Surface className="replay-state" tone="raised">
    <span className="replay-state-code">{content.code}</span>
    <div>
      <h2>{content.title}</h2>
      <p>{content.body}</p>
      <div className="replay-state-actions">
        {state === "signed-out" && <Link className="button-link" href="/auth/sign-in">Sign in securely</Link>}
        {state === "unavailable" && <button type="button" onClick={retry}>Try replay again</button>}
        <Link className="button-link button-link-secondary" href="/account">Back to your record</Link>
      </div>
    </div>
  </Surface>;
}

/** Owns replay position and playback; the stored record itself stays immutable. */
function ReplayReady({ match }: { readonly match: MatchReplayDetail }) {
  const frames = useMemo(() => buildMatchReplayTimeline(match.record), [match.record]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const lastFrameIndex = frames.length - 1;
  const frame = frames[frameIndex];

  useEffect(() => {
    if (!playing || frameIndex >= lastFrameIndex) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(frameIndex + 1, lastFrameIndex);
      setFrameIndex(next);
      if (next === lastFrameIndex) setPlaying(false);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [frameIndex, lastFrameIndex, playing]);

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("a, button, input, select, textarea"))) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault(); setPlaying(false); setFrameIndex((value) => Math.max(0, value - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault(); setPlaying(false); setFrameIndex((value) => Math.min(lastFrameIndex, value + 1));
      } else if (event.key === "Home") {
        event.preventDefault(); setPlaying(false); setFrameIndex(0);
      } else if (event.key === "End") {
        event.preventDefault(); setPlaying(false); setFrameIndex(lastFrameIndex);
      } else if (event.key === " ") {
        event.preventDefault();
        if (lastFrameIndex <= 0) return;
        setPlaying((value) => {
          if (!value && frameIndex === lastFrameIndex) setFrameIndex(0);
          return !value;
        });
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [frameIndex, lastFrameIndex]);

  if (!frame) {
    return <ReplayState state="unavailable" />;
  }

  function moveTo(index: number) {
    setPlaying(false);
    setFrameIndex(Math.max(0, Math.min(lastFrameIndex, index)));
  }

  function togglePlayback() {
    if (lastFrameIndex <= 0) {
      setPlaying(false);
      return;
    }
    if (!playing && frameIndex === lastFrameIndex) setFrameIndex(0);
    setPlaying((value) => !value);
  }

  const activePlayer = match.record.players.find((player) => player.seat === frame.seat);
  const winner = match.record.players.find((player) => player.seat === match.record.winnerSeat);
  const boardDarts = dartsVisibleInVisit(frames, frame);
  const currentScore = frame.scoreAfter ?? frame.scoreBefore;

  return <section className="replay-shell" aria-label={`${modeName(match.record.mode)} match replay`}>
    <Surface className="replay-summary">
      <ReplayFact label="Mode" value={modeName(match.record.mode)} />
      <ReplayFact label="Played" value={formatDate(match.completedAt)} />
      <ReplayFact label="Players" value={match.record.players.map((player) => player.displayName).join(" · ")} />
      <ReplayFact label="Result" value={winner ? `${winner.displayName} won` : "No winner recorded"} />
    </Surface>

    <Surface className="replay-stage" tone="raised">
      <div className="replay-board-panel">
        <Dartboard
          readOnly
          darts={boardDarts}
          caption={frame.landing.kind === "dart" ? `Dart ${frame.ordinal} · ${frame.landing.notation}` : "Landing unknown"}
          hint={frame.landing.kind === "dart"
            ? frame.landing.coordinateSource === "recorded" ? "Recorded impact point" : "Recorded bed · representative point"
            : "No marker can be drawn truthfully"}
        />
      </div>

      <div className="replay-console">
        <header className="replay-frame-head">
          <div>
            <span>ACTIVE SEAT {frame.seat + 1}</span>
            <h2>{activePlayer?.displayName ?? `Seat ${frame.seat + 1}`}</h2>
          </div>
          <strong aria-label={`Current score ${currentScore}`}>{currentScore}</strong>
        </header>

        <dl className="replay-frame-facts">
          <ReplayFrameFact label="Turn" value={String(frame.turnNumber)} />
          <ReplayFrameFact label="Leg" value={String(frame.legNumber)} />
          <ReplayFrameFact label="Dart" value={`${frame.ordinal}/${frame.dartsThrown}`} />
          <ReplayFrameFact label="Score" value={frame.scoreAfter === null ? `${frame.scoreBefore} · pending visit` : `${frame.scoreBefore} → ${frame.scoreAfter}`} />
        </dl>

        <LandingTruth frame={frame} />

        <ol className="replay-scoreboard" aria-label="Score at this frame">
          {match.record.players.map((player) => <li key={player.seat} aria-current={player.seat === frame.seat ? "true" : undefined}>
            <span><i>{player.seat + 1}</i>{player.displayName}{player.seat === match.ownerSeat && <small>YOU</small>}</span>
            <strong>{scoreAtFrame(frames, frame.frameNumber, player.seat) ?? "—"}</strong>
          </li>)}
        </ol>

        <div className="replay-transport" aria-label="Replay controls">
          <button type="button" onClick={() => moveTo(0)} disabled={frameIndex === 0} aria-label="First dart" aria-keyshortcuts="Home">|←</button>
          <button type="button" onClick={() => moveTo(frameIndex - 1)} disabled={frameIndex === 0} aria-label="Previous dart" aria-keyshortcuts="ArrowLeft">←</button>
          <button className="replay-play" type="button" onClick={togglePlayback} disabled={lastFrameIndex <= 0} aria-label={lastFrameIndex <= 0 ? "Replay has one dart" : playing ? "Pause replay" : "Play replay"} aria-pressed={playing} aria-keyshortcuts="Space">{playing ? "Pause" : "Play"}</button>
          <button type="button" onClick={() => moveTo(frameIndex + 1)} disabled={frameIndex === lastFrameIndex} aria-label="Next dart" aria-keyshortcuts="ArrowRight">→</button>
          <button type="button" onClick={() => moveTo(lastFrameIndex)} disabled={frameIndex === lastFrameIndex} aria-label="Last dart" aria-keyshortcuts="End">→|</button>
        </div>
        <div className="replay-progress" aria-live="polite">
          <span>Frame {frame.frameNumber} of {frames.length}</span>
          <i style={{ "--replay-progress": `${(frame.frameNumber / frames.length) * 100}%` } as CSSProperties} />
        </div>
        <small className="replay-keyboard-help">Keyboard: ←/→ one dart · Home/End first or last · Space play or pause. Playback starts only on command.</small>
      </div>
    </Surface>

    <Link className="button-link button-link-secondary replay-back" href="/account">← Back to your record</Link>
  </section>;
}

function LandingTruth({ frame }: { readonly frame: MatchReplayFrame }) {
  if (frame.landing.kind === "unknown") {
    const total = frame.landing.visitAggregateScore === null ? "an aggregate" : `a ${frame.landing.visitAggregateScore}-point`;
    return <div className="replay-landing unknown" data-landing="unknown">
      <span>LANDING UNKNOWN</span>
      <b>Dart {frame.ordinal} has no stored bed or coordinate.</b>
      <p>This visit was entered as {total} total. The replay keeps its board empty and applies the stored final score only after dart {frame.dartsThrown}.</p>
      <BustTruth frame={frame} />
    </div>;
  }

  return <div className="replay-landing" data-landing="dart">
    <span>{frame.landing.coordinateSource === "recorded" ? "RECORDED IMPACT" : "RECORDED BED"}</span>
    <b>{frame.landing.notation} · {frame.landing.score} {frame.landing.score === 1 ? "point" : "points"}</b>
    <p>{frame.landing.coordinateSource === "recorded"
      ? "The marker uses the impact coordinates stored with this dart."
      : "The bed is known, but its physical impact point was not stored. The marker sits at that bed’s representative point."}</p>
    <BustTruth frame={frame} />
  </div>;
}

function BustTruth({ frame }: { readonly frame: MatchReplayFrame }) {
  return frame.bust === true
    ? <strong className="replay-bust">BUST · The stored visit was recorded as a bust.</strong>
    : null;
}

function ReplayFact({ label, value }: { readonly label: string; readonly value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ReplayFrameFact({ label, value }: { readonly label: string; readonly value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

/** Only darts from the active visit stay on the board, just like a physical retrieve. */
function dartsVisibleInVisit(frames: readonly MatchReplayFrame[], current: MatchReplayFrame): readonly Dart[] {
  return frames
    .filter((frame) => frame.turnNumber === current.turnNumber && frame.frameNumber <= current.frameNumber)
    .flatMap((frame) => {
      const landing = frame.landing;
      return landing.kind === "dart"
        ? [dart(landing.segment as BoardNumber | 0, landing.multiplier, { x: landing.x, y: landing.y })]
        : [];
    });
}

/** Returns only scores the generic record has actually resolved by this frame. */
function scoreAtFrame(frames: readonly MatchReplayFrame[], frameNumber: number, seat: number): number | null {
  const visible = frames.filter((frame) => frame.seat === seat && frame.frameNumber <= frameNumber);
  if (visible.length === 0) return null;
  const current = visible.at(-1);
  // A new leg may reset a score. Its stored scoreBefore is newer authority than
  // the previous leg's final score, even before this visit has resolved.
  if (current?.frameNumber === frameNumber && current.scoreAfter === null) return current.scoreBefore;
  for (let index = visible.length - 1; index >= 0; index -= 1) {
    const score = visible[index]?.scoreAfter;
    if (score !== null && score !== undefined) return score;
  }
  return visible[0]?.scoreBefore ?? null;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
