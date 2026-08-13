"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Surface } from "navi-ui";
import { DRILLS } from "@/domain/drills";
import { modeName } from "@/domain/modes";
import {
  fetchCareerStats,
  fetchMatchHistory,
  type CareerStatsView,
  type MatchHistoryEntryView,
} from "@/lib/product/match-history-client";

/**
 * The player's own record, on the account page.
 *
 * The server owns both the history window and the deep-stat entitlement. This
 * component never derives paid figures from the headline response, and it calls
 * a practice drill a session rather than making an opponent-free drill look like
 * a lost match.
 */

const RECENT = 5;

type Load<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "unavailable" };

export function PlayerStats() {
  const [stats, setStats] = useState<Load<CareerStatsView>>({ status: "loading" });
  const [history, setHistory] = useState<Load<readonly MatchHistoryEntryView[]>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetchCareerStats({ signal: controller.signal })
      .then((value) => setStats(value ? { status: "ready", value } : { status: "unavailable" }))
      .catch(() => setStats({ status: "unavailable" }));
    void fetchMatchHistory({ signal: controller.signal, limit: RECENT })
      .then((value) => setHistory(value ? { status: "ready", value } : { status: "unavailable" }))
      .catch(() => setHistory({ status: "unavailable" }));
    return () => controller.abort();
  }, []);

  return <section className="account-stats" aria-label="Your record">
    <StatsPanel load={stats} />
    <HistoryPanel load={history} />
  </section>;
}

function StatsPanel({ load }: { load: Load<CareerStatsView> }) {
  if (load.status === "loading") {
    return <Surface className="stats-card stats-state" aria-busy="true">
      <span className="command-index">03</span>
      <div><h3>Your numbers</h3><p role="status">Reading your completed sessions…</p></div>
    </Surface>;
  }
  if (load.status === "unavailable") {
    return <Surface className="stats-card stats-state">
      <span className="command-index">03</span>
      <div><h3>Your numbers</h3><p role="alert">Your record could not be read just now. Nothing has been lost — this is a reading problem, not a scoring one.</p></div>
    </Surface>;
  }

  const { value } = load;
  if (value.matchesPlayed === 0) {
    return <Surface className="stats-card stats-state">
      <span className="command-index">03</span>
      <div>
        <h3>Your numbers</h3>
        <p>No finished sessions yet. Complete a match or practice drill and it lands here.</p>
        <Link className="button-link" href="/play">Start a session</Link>
      </div>
    </Surface>;
  }

  return <Surface className="stats-card">
    <span className="command-index">03</span>
    <div className="stats-content">
      <header className="stats-heading">
        <div><h3>Your numbers</h3><p>Competitive results and practice sessions stay separate, so a solo drill never becomes a loss.</p></div>
        <span>{value.matchesPlayed} completed {value.matchesPlayed === 1 ? "session" : "sessions"}</span>
      </header>
      <dl className="stat-grid stats-headline">
        <Stat label="Competitive" value={String(value.competitiveMatches)} note="matches" />
        <Stat label="Practice" value={String(value.practiceSessions)} note="sessions" />
        <Stat label="Competitive wins" value={String(value.matchesWon)} />
        <Stat label="Win rate" value={`${round(value.winPercentage)}%`} note="won / lost" />
        <Stat label="X01 3-dart average" value={round(value.threeDartAverage)} />
        <Stat label="Visits" value={String(value.visits)} />
        <Stat label="Darts thrown" value={String(value.dartsThrown)} />
      </dl>

      {value.deep
        ? <DeepStats deep={value.deep} />
        : <div className="stats-locked">
          <p><b>First nine, checkout percentage, finishing doubles, trends, and your mode breakdown are Pro.</b> They are computed on the server and not sent to a Free plan, so there is nothing hidden here to unhide.</p>
          <Link className="button-link" href="/pricing">See Pro</Link>
        </div>}
      {value.historyLimit !== null && <small className="stats-window">Free statistics use your most recent {value.historyLimit} completed sessions.</small>}
    </div>
  </Surface>;
}

function DeepStats({ deep }: { deep: NonNullable<CareerStatsView["deep"]> }) {
  return <div className="stats-depth">
    <div className="stats-section-heading">
      <div><span>PRO DEPTH</span><h4>Patterns behind the scoreline</h4></div>
      <p>Only completed, saved sessions contribute to these figures.</p>
    </div>

    <dl className="stat-grid stats-deep-summary">
      <Stat label="X01 matches" value={String(deep.x01Matches)} />
      <Stat label="First nine" value={round(deep.firstNineAverage)} note="3-dart average" />
      <Stat label="Checkout" value={`${round(deep.checkoutPercentage)}%`} note={`${deep.checkoutsHit}/${deep.checkoutAttempts} attempts`} />
      <Stat label="Best visit" value={String(deep.bestVisit)} />
      <Stat label="Best leg" value={deep.bestLegDarts === null ? "—" : String(deep.bestLegDarts)} note={deep.bestLegDarts === null ? "no leg won yet" : "darts"} />
      <Stat label="Busts" value={String(deep.busts)} />
    </dl>

    <div className="stats-insight-grid">
      <section className="stats-insight" aria-labelledby="recent-form-heading">
        <header><h4 id="recent-form-heading">Recent competitive form</h4><span>Newest first</span></header>
        {deep.recentForm.length === 0
          ? <p className="stats-inline-empty">No decided competitive results yet.</p>
          : <ol className="recent-form-list">
            {[...deep.recentForm].reverse().map((entry, index) => <li key={`${entry.completedAt}-${entry.mode}-${index}`}>
              <Result result={entry.result} />
              <span><b>{modeName(entry.mode)}</b><small>{formatDate(entry.completedAt)}</small></span>
            </li>)}
          </ol>}
      </section>

      <section className="stats-insight" aria-labelledby="finishing-beds-heading">
        <header><h4 id="finishing-beds-heading">Finishing doubles</h4><span>Successful darts</span></header>
        <p className="stats-truth-note">Observed exact finishing doubles only. This is not aim data or attempt accuracy.</p>
        {deep.finishingBeds.length === 0
          ? <p className="stats-inline-empty">No exact finishing double has been stored yet.</p>
          : <div className="stats-table-scroll"><table className="stats-table stats-finishes">
            <caption className="sr-only">Successful exact finishing doubles</caption>
            <thead><tr><th scope="col">Double</th><th scope="col">Hits</th><th scope="col">Share</th></tr></thead>
            <tbody>{deep.finishingBeds.map((bed) => <tr key={bed.segment}>
              <th scope="row">{doubleName(bed.segment)}</th><td>{bed.hits}</td><td>{round(bed.share)}%</td>
            </tr>)}</tbody>
          </table></div>}
        {deep.unattributedCheckouts > 0 && <p className="stats-unattributed"><b>{deep.unattributedCheckouts} other / unattributed {deep.unattributedCheckouts === 1 ? "finish" : "finishes"}.</b> No stored double-finishing bed was observable; aggregate, partial, and non-double finish evidence stays out of this table.</p>}
      </section>
    </div>

    <section className="stats-data-section" aria-labelledby="x01-trend-heading">
      <div className="stats-section-heading compact"><div><span>X01</span><h4 id="x01-trend-heading">Recent trend</h4></div><p>Per-match averages; newest completed match first.</p></div>
      {deep.x01Trend.length === 0
        ? <p className="stats-inline-empty">No completed X01 trend yet.</p>
        : <div className="stats-table-scroll"><table className="stats-table stats-trend-table">
          <caption className="sr-only">Recent X01 performance trend</caption>
          <thead><tr><th scope="col">Completed</th><th scope="col">Result</th><th scope="col">3-dart average</th><th scope="col">Checkout</th></tr></thead>
          <tbody>{[...deep.x01Trend].reverse().map((entry, index) => <tr key={`${entry.completedAt}-${index}`}>
            <th scope="row">{formatDate(entry.completedAt)}</th><td><Result result={entry.result} /></td><td>{round(entry.threeDartAverage)}</td><td>{round(entry.checkoutPercentage)}%</td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    <section className="stats-data-section" aria-labelledby="mode-record-heading">
      <div className="stats-section-heading compact"><div><span>ALL MODES</span><h4 id="mode-record-heading">Session breakdown by mode</h4></div><p>Unscored sessions have no winner and are not counted as losses.</p></div>
      {deep.modes.length === 0
        ? <p className="stats-inline-empty">No mode breakdown yet.</p>
        : <div className="stats-table-scroll"><table className="stats-table stats-mode-table">
          <caption className="sr-only">Completed sessions by game mode</caption>
          <thead><tr><th scope="col">Mode</th><th scope="col">Played</th><th scope="col">Won</th><th scope="col">Lost</th><th scope="col">No result</th><th scope="col">Win rate</th><th scope="col">Volume</th></tr></thead>
          <tbody>{deep.modes.map((tally) => <tr key={tally.mode}>
            <th scope="row">{modeName(tally.mode)}</th><td>{tally.played}</td><td>{tally.won}</td><td>{tally.lost}</td><td>{tally.unscored}</td><td>{tally.winPercentage === null ? "—" : `${round(tally.winPercentage)}%`}</td><td>{tally.visits} visits · {tally.dartsThrown} darts</td>
          </tr>)}</tbody>
        </table></div>}
    </section>

    <section className="stats-data-section" aria-labelledby="drill-progress-heading">
      <div className="stats-section-heading compact"><div><span>PRACTICE</span><h4 id="drill-progress-heading">Drill progress</h4></div><p>Each entry is a completed session, never a win or loss.</p></div>
      {deep.drills.length === 0
        ? <p className="stats-inline-empty">No completed practice drills yet.</p>
        : <ul className="drill-stat-list">
          {deep.drills.map((drill) => <li key={drill.mode}>
            <header><div><h5>{modeName(drill.mode)}</h5><span>{drill.sessions} {drill.sessions === 1 ? "session" : "sessions"}</span></div><small>{drill.unit}</small></header>
            <dl>
              <Stat label="Latest" value={drillValue(drill.latest)} note={drill.unit} />
              <Stat label="Best" value={drillValue(drill.best)} note={drill.unit} />
              <Stat label="Average" value={drillValue(drill.average)} note={drill.unit} />
            </dl>
            {drill.recent.length > 0 && <ol aria-label={`Recent ${modeName(drill.mode)} sessions`}>
              {drill.recent.map((entry, index) => <li key={`${entry.completedAt}-${index}`}><span>{formatDate(entry.completedAt)}</span><b>{round(entry.value)} {drill.unit}</b></li>)}
            </ol>}
          </li>)}
        </ul>}
    </section>
  </div>;
}

function HistoryPanel({ load }: { load: Load<readonly MatchHistoryEntryView[]> }) {
  if (load.status === "loading") return <Surface className="history-card" aria-busy="true"><span className="command-index">04</span><div><h3>Recent sessions</h3><p role="status">Loading saved sessions…</p></div></Surface>;
  if (load.status === "unavailable") return <Surface className="history-card"><span className="command-index">04</span><div><h3>Recent sessions</h3><p role="alert">History could not be read just now.</p></div></Surface>;
  if (load.value.length === 0) return <Surface className="history-card"><span className="command-index">04</span><div><h3>Recent sessions</h3><p>Nothing here yet.</p></div></Surface>;

  return <Surface className="history-card"><span className="command-index">04</span><div>
    <h3>Recent sessions</h3>
    <ol className="history-list">
      {load.value.map((match) => {
        const you = match.players.find((player) => player.isYou);
        const won = you !== undefined && match.winnerSeat === you.seat;
        const resultClass = match.winnerSeat === null ? "history-no-result" : won ? "history-won" : "history-lost";
        const resultLabel = match.winnerSeat === null ? "No result" : won ? "Won" : "Lost";
        const others = match.players.filter((player) => !player.isYou).map((player) => player.isBot ? `${player.displayName} (LV ${player.botLevel ?? "?"})` : player.displayName);
        return <li key={match.id}>
          <Link className="history-replay-link" href={`/account/matches/${encodeURIComponent(match.id)}`} aria-label={`Replay ${modeName(match.mode)} ${replayKind(match.mode)} from ${formatDate(match.completedAt)}`}>
            <div><b>{modeName(match.mode)}</b><span>{others.length > 0 ? `vs ${others.join(", ")}` : "Solo session"}</span></div>
            <div className="history-meta"><span className={resultClass}>{resultLabel}</span><small>{match.dartCount} {match.dartCount === 1 ? "dart" : "darts"} · {formatDate(match.completedAt)}</small></div>
            <span className="history-replay-cue" aria-hidden="true">Replay →</span>
          </Link>
        </li>;
      })}
    </ol>
  </div></Surface>;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="stat"><dt>{label}</dt><dd>{value}{note && <small>{note}</small>}</dd></div>;
}

function Result({ result }: { result: "won" | "lost" }) {
  const label = result === "won" ? "Won" : "Lost";
  return <span className={`stats-result ${result}`}><span aria-hidden="true">{label[0]}</span><span className="sr-only">{label}</span></span>;
}

/** Two decimals for averages, none for whole numbers — "60" is exact, not unfinished. */
function round(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

function drillValue(value: number | null): string {
  return value === null ? "—" : round(value);
}

function doubleName(segment: number): string {
  return segment === 25 ? "Double bull" : `D${segment}`;
}

/** History stores games and drills together, but only games should be called matches. */
function replayKind(mode: string): "match" | "practice session" {
  return Object.prototype.hasOwnProperty.call(DRILLS, mode) || mode === "customPractice" ? "practice session" : "match";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
