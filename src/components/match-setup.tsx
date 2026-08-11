"use client";

import { useState } from "react";
import Link from "next/link";
import { SegmentedControl, SelectField, Surface } from "navi-ui";
import type { RoundModeId } from "@/domain";
import { hasAccessEntitlement, isProductAvailable } from "@/lib/product/access-contract";
import { useAccess } from "./access-provider";

type SetupMode = "x01" | "cricket" | RoundModeId;

const MODE_OPTIONS: ReadonlyArray<{ readonly value: SetupMode; readonly label: string }> = [
  { value: "x01", label: "X01" },
  { value: "cricket", label: "Cricket" },
  { value: "aroundTheClock", label: "Around the Clock" },
  { value: "shanghai", label: "Shanghai" },
  { value: "countUp", label: "Count-Up" },
  { value: "bobs27", label: "Bob’s 27" },
];

const MODE_SUMMARY: Record<Exclude<SetupMode, "x01" | "cricket">, {
  readonly format: string;
  readonly rules: string;
}> = {
  aroundTheClock: { format: "1 through 20, then bull", rules: "Any bed advances the target" },
  shanghai: { format: "20 rounds", rules: "Single, double, treble wins outright" },
  countUp: { format: "8 rounds", rules: "Every dart counts" },
  bobs27: { format: "Doubles 1 through 20", rules: "Miss the double and lose its value" },
};

export function MatchSetup() {
  const access = useAccess();
  const [mode, setMode] = useState<SetupMode>("x01");
  const [variant, setVariant] = useState("standard");
  const [opponent, setOpponent] = useState("ai");
  const [start, setStart] = useState("501");
  const [level, setLevel] = useState(8);
  const [bestOf, setBestOf] = useState("5");
  const [inRule, setInRule] = useState("straight");
  const [outRule, setOutRule] = useState("double");
  const advancedAi = access.status === "ready"
    && isProductAvailable(access.snapshot, "advancedAi")
    && hasAccessEntitlement(access.snapshot, "advanced_ai");
  const aiMaxLevel = advancedAi ? access.snapshot.limits.aiMaxLevel : 8;
  const selectedLevel = Math.min(level, aiMaxLevel);
  const modeLabel = MODE_OPTIONS.find((option) => option.value === mode)?.label ?? "X01";
  const hasModeOptions = mode === "x01" || mode === "cricket";
  const levelSection = hasModeOptions ? "04" : "03";
  const opponentQuery = opponent === "ai" ? `&level=${selectedLevel}` : "";
  const matchHref = mode === "x01"
    ? `/play/match?start=${start}&level=${selectedLevel}&best=${bestOf}&in=${inRule}&out=${outRule}&opponent=${opponent}`
    : mode === "cricket"
      ? `/play/match?mode=cricket&variant=${variant}&opponent=${opponent}${opponentQuery}`
      : `/play/match?mode=${mode}&opponent=${opponent}${opponentQuery}`;
  const ticketFormat = mode === "x01"
    ? `Best of ${bestOf}`
    : mode === "cricket"
      ? "First to close out"
      : MODE_SUMMARY[mode].format;
  const ticketRules = mode === "x01"
    ? `${inRule} in · ${outRule} out`
    : mode === "cricket"
      ? variant
      : MODE_SUMMARY[mode].rules;

  return <div className="page-frame setup-page">
    <header className="page-heading">
      <p className="eyebrow">New match</p>
      <h1>Set the oche.</h1>
      <p>Choose the rules now. You can correct throws during the leg without breaking the rhythm.</p>
    </header>
    <div className="setup-layout">
      <section className="setup-form" aria-label="Match settings">
        <div className="setup-section">
          <span className="setup-number">01</span>
          <div>
            <h2>Which game?</h2>
            <SelectField
              label="Game mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as SetupMode)}
              options={MODE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            />
          </div>
        </div>
        <div className="setup-section">
          <span className="setup-number">02</span>
          <div>
            <h2>Who are you playing?</h2>
            <SegmentedControl
              label="Opponent"
              value={opponent}
              onChange={setOpponent}
              options={[{ label: "Dartio AI", value: "ai" }, { label: "Local friend", value: "local" }]}
            />
          </div>
        </div>
        {mode === "cricket" && <div className="setup-section">
          <span className="setup-number">03</span>
          <div>
            <h2>Cricket rules</h2>
            <SegmentedControl
              label="Cricket variant"
              value={variant}
              onChange={setVariant}
              options={[
                { label: "Standard", value: "standard" },
                { label: "Cut-throat", value: "cut-throat" },
                { label: "Tactics", value: "tactics" },
              ]}
            />
            <p className="setup-note">{variant === "standard"
              ? "Close a number, then score on it while your opponent is still open."
              : variant === "cut-throat"
                ? "Points are inflicted on open opponents. The lowest score wins."
                : "No points at all. First to close everything takes it."}</p>
          </div>
        </div>}
        {mode === "x01" && <div className="setup-section">
          <span className="setup-number">03</span>
          <div>
            <h2>Match format</h2>
            <div className="field-grid">
              <SelectField label="Starting score" value={start} onChange={(event) => setStart(event.target.value)} options={[301, 501, 701, 1001].map((value) => ({ value: String(value), label: String(value) }))} />
              <SelectField label="Best of legs" value={bestOf} onChange={(event) => setBestOf(event.target.value)} options={[1, 3, 5, 7].map((value) => ({ value: String(value), label: `${value} leg${value === 1 ? "" : "s"}` }))} />
              <SelectField label="In rule" value={inRule} onChange={(event) => setInRule(event.target.value)} options={[{ value: "straight", label: "Straight in" }, { value: "double", label: "Double in" }, { value: "master", label: "Master in" }]} />
              <SelectField label="Out rule" value={outRule} onChange={(event) => setOutRule(event.target.value)} options={[{ value: "straight", label: "Straight out" }, { value: "double", label: "Double out" }, { value: "master", label: "Master out" }]} />
            </div>
          </div>
        </div>}
        {opponent === "ai" && <div className="setup-section">
          <span className="setup-number">{levelSection}</span>
          <div>
            <h2>AI opponent</h2>
            <label className="level-control">
              <span>
                <b>Level {selectedLevel}</b>
                <small>{selectedLevel < 7 ? "Learning the board" : selectedLevel < 14 ? "League-night regular" : "Tournament pressure"}</small>
              </span>
              <input
                aria-label={`AI level, maximum ${aiMaxLevel}`}
                type="range"
                min="1"
                max={aiMaxLevel}
                value={selectedLevel}
                onChange={(event) => setLevel(Number(event.target.value))}
              />
              <span className="level-scale"><i>1</i><i>Accuracy and decision quality</i><i>{aiMaxLevel}</i></span>
            </label>
            <div className={`level-access ${advancedAi ? "unlocked" : "locked"}`}>
              <div>
                <b>{advancedAi ? "PRO RANGE ACTIVE" : "LEVELS 9–20 · PRO"}</b>
                <span>{access.status === "loading"
                  ? "Checking Pro access…"
                  : access.status === "unavailable"
                    ? "Paid access could not be verified. Levels 1–8 remain available."
                    : advancedAi
                      ? "All twenty AI levels are available in every match mode."
                      : "Free play includes AI levels 1–8."}</span>
              </div>
              {access.status === "unavailable"
                ? <button type="button" onClick={() => void access.retry()}>Retry</button>
                : !advancedAi && access.status === "ready"
                  ? <Link href="/pricing">View Pro</Link>
                  : null}
            </div>
          </div>
        </div>}
      </section>
      <aside>
        <Surface className="match-ticket">
          <span className="ticket-kicker">Tonight’s match</span>
          <div className="ticket-versus">
            <div><span>You</span><strong>PLAYER 1</strong></div>
            <b>VS</b>
            <div>
              <span>{opponent === "ai" ? `AI · LV ${selectedLevel}` : "LOCAL"}</span>
              <strong>{opponent === "ai" ? "THE NAVIGATOR" : "PLAYER 2"}</strong>
            </div>
          </div>
          <dl>
            <div><dt>Game</dt><dd>{mode === "x01" ? `${start} X01` : modeLabel}</dd></div>
            <div><dt>Format</dt><dd>{ticketFormat}</dd></div>
            <div><dt>Rules</dt><dd>{ticketRules}</dd></div>
          </dl>
          <Link className="button-link button-link-lg" href={matchHref}>Walk to the oche →</Link>
          <small>{opponent === "ai" && advancedAi && selectedLevel > 8
            ? "Pro AI access verified for this browser session."
            : opponent === "ai"
              ? "Local scoring and AI levels 1–8 need no account."
              : "Local pass-and-play needs no account."}</small>
        </Surface>
      </aside>
    </div>
  </div>;
}
