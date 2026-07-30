"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Surface } from "navi-ui";
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
 * Until now `/account` showed a membership card and nothing else, because nothing
 * was ever persisted to show. Both panels degrade honestly: a player with no
 * matches is told they have none rather than shown zeroes as if they had played,
 * and a player whose plan withholds the deep figures is told which figures and why
 * — the server never sent them, so there is nothing here to reveal.
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
  if (load.status === "loading") return <Surface className="stats-card" aria-busy="true"><span className="command-index">03</span><div><h3>Your numbers</h3><p role="status">Reading your matches…</p></div></Surface>;
  if (load.status === "unavailable") return <Surface className="stats-card"><span className="command-index">03</span><div><h3>Your numbers</h3><p>Your record could not be read just now. Nothing has been lost — this is a reading problem, not a scoring one.</p></div></Surface>;

  const { value } = load;
  if (value.matchesPlayed === 0) {
    return <Surface className="stats-card"><span className="command-index">03</span><div><h3>Your numbers</h3><p>No finished matches yet. Play one and it lands here — every mode is recorded, and free play still needs no account.</p><Link className="button-link" href="/play">Start a match</Link></div></Surface>;
  }

  return <Surface className="stats-card"><span className="command-index">03</span><div>
    <h3>Your numbers</h3>
    <dl className="stat-grid">
      <Stat label="Matches" value={String(value.matchesPlayed)} />
      <Stat label="Won" value={`${value.matchesWon}`} note={`${round(value.winPercentage)}%`} />
      <Stat label="3-dart average" value={round(value.threeDartAverage)} note="X01" />
      <Stat label="Darts thrown" value={String(value.dartsThrown)} />
    </dl>
    {value.deep
      ? <dl className="stat-grid deep">
        <Stat label="First nine" value={round(value.deep.firstNineAverage)} />
        <Stat label="Checkout" value={`${round(value.deep.checkoutPercentage)}%`} note={`${value.deep.checkoutsHit}/${value.deep.checkoutAttempts}`} />
        <Stat label="Best visit" value={String(value.deep.bestVisit)} />
        <Stat label="Best leg" value={value.deep.bestLegDarts === null ? "—" : `${value.deep.bestLegDarts}`} note={value.deep.bestLegDarts === null ? "no leg won yet" : "darts"} />
      </dl>
      : <div className="stats-locked"><p><b>First nine, checkout percentage, best visit, best leg, and your mode breakdown are Pro.</b> They are computed on the server and not sent to a Free plan, so there is nothing hidden here to unhide.</p><Link className="button-link" href="/pricing">See Pro</Link></div>}
    {value.deep && value.deep.modes.length > 1 && <ul className="mode-tally">
      {value.deep.modes.map((tally) => <li key={tally.mode}><span>{modeName(tally.mode)}</span><b>{tally.won}/{tally.played}</b></li>)}
    </ul>}
    {value.historyLimit !== null && <small className="stats-window">Free keeps your most recent {value.historyLimit} matches.</small>}
  </div></Surface>;
}

function HistoryPanel({ load }: { load: Load<readonly MatchHistoryEntryView[]> }) {
  if (load.status === "loading") return <Surface className="history-card" aria-busy="true"><span className="command-index">04</span><div><h3>Recent matches</h3><p role="status">Loading…</p></div></Surface>;
  if (load.status === "unavailable") return <Surface className="history-card"><span className="command-index">04</span><div><h3>Recent matches</h3><p>History could not be read just now.</p></div></Surface>;
  if (load.value.length === 0) return <Surface className="history-card"><span className="command-index">04</span><div><h3>Recent matches</h3><p>Nothing here yet.</p></div></Surface>;

  return <Surface className="history-card"><span className="command-index">04</span><div>
    <h3>Recent matches</h3>
    <ol className="history-list">
      {load.value.map((match) => {
        const you = match.players.find((player) => player.isYou);
        const won = you !== undefined && match.winnerSeat === you.seat;
        const others = match.players.filter((player) => !player.isYou).map((player) => player.isBot ? `${player.displayName} (LV ${player.botLevel ?? "?"})` : player.displayName);
        return <li key={match.id}>
          <div>
            <b>{modeName(match.mode)}</b>
            <span>{others.length > 0 ? `vs ${others.join(", ")}` : "Solo"}</span>
          </div>
          <div className="history-meta">
            <span className={won ? "history-won" : "history-lost"}>{match.winnerSeat === null ? "Unfinished" : won ? "Won" : "Lost"}</span>
            <small>{match.dartCount} darts · {formatDate(match.completedAt)}</small>
          </div>
        </li>;
      })}
    </ol>
  </div></Surface>;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="stat"><dt>{label}</dt><dd>{value}{note && <small>{note}</small>}</dd></div>;
}

/** Two decimals for averages, none for whole numbers — an average of "60" reads as unfinished work. */
function round(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
