"use client";

import Link from "next/link";
import { Surface } from "navi-ui";
import type { X01Player } from "@/domain";

type MatchResultProps = {
  players: readonly X01Player[];
  winnerId?: string;
  legs: readonly number[];
  averages: readonly number[];
};

export function MatchResult({ players, winnerId, legs, averages }: MatchResultProps) {
  const winner = players.find((player) => player.id === winnerId);

  function reviewVisits() {
    const history = document.getElementById("visit-history");
    history?.scrollIntoView({ behavior: "smooth", block: "start" });
    history?.focus({ preventScroll: true });
  }

  return (
    <Surface className="match-result" aria-labelledby="match-result-heading" tone="accent">
      <div className="match-result__lead">
        <span>MATCH COMPLETE</span>
        <h2 id="match-result-heading">{winner?.name ?? "Winner"} takes the match.</h2>
      </div>
      <div className="match-result__score" aria-label={`Final score ${legs[0] ?? 0} to ${legs[1] ?? 0}`}>
        <strong>{legs[0] ?? 0}</strong><span>—</span><strong>{legs[1] ?? 0}</strong>
      </div>
      <dl className="match-result__stats">
        {players.map((player, index) => (
          <div key={player.id}>
            <dt>{player.name}</dt>
            <dd>{averages[index]?.toFixed(2) ?? "0.00"} <span>3DA</span></dd>
          </div>
        ))}
      </dl>
      <div className="match-result__actions">
        <Link className="button-link" href="/play">Play again</Link>
        <button type="button" onClick={reviewVisits}>Review visits</button>
      </div>
    </Surface>
  );
}
