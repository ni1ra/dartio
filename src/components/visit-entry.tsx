"use client";

import { useState } from "react";
import { Button, SegmentedControl, Surface, Tabs, TextField } from "navi-ui";
import {
  AggregateVisitRequiresDartsError,
  notation,
  type Dart,
} from "@/domain";
import { DartInputPad } from "./dart-input-pad";

type InputMode = "board" | "score" | "darts";
type DartsThrown = "1" | "2" | "3";

type VisitEntryProps = {
  darts: readonly Dart[];
  disabled?: boolean;
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
  onDart: (value: Dart) => void;
  onAggregate: (score: number, dartsThrown: 1 | 2 | 3) => void;
};

export function VisitEntry({
  darts,
  disabled = false,
  mode,
  onModeChange,
  onDart,
  onAggregate,
}: VisitEntryProps) {
  const [score, setScore] = useState("");
  const [dartsThrown, setDartsThrown] = useState<DartsThrown>("3");
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<string | null>(null);

  function submitAggregate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setGuidance(null);
    const raw = score.trim();
    if (!raw) {
      setError("Enter the visit total.");
      return;
    }
    if (!/^\d+$/.test(raw)) {
      setError("Use a whole-number score.");
      return;
    }
    try {
      onAggregate(Number(raw), Number(dartsThrown) as 1 | 2 | 3);
      setScore("");
    } catch (problem) {
      if (problem instanceof AggregateVisitRequiresDartsError) {
        const nextGuidance = problem.reason === "in-rule"
          ? "Enter each dart until the player is in."
          : problem.reason === "out-rule"
            ? "Enter each dart so the finishing bed can be verified."
            : "Finish the current visit one dart at a time.";
        setGuidance(nextGuidance);
        onModeChange("darts");
        return;
      }
      setError(problem instanceof Error ? problem.message : "That visit cannot be recorded.");
    }
  }

  const currentDarts = (
    <div className="current-darts" aria-label="Current visit">
      {[0, 1, 2].map((index) => (
        <div key={index} className={darts[index] ? "filled" : ""}>
          <span>D{index + 1}</span>
          <strong>{darts[index] ? notation(darts[index]!) : "—"}</strong>
          <small>{darts[index]?.score ?? "Waiting"}</small>
        </div>
      ))}
    </div>
  );

  return (
    <Surface className="visit-panel" aria-label="Visit entry">
      {currentDarts}
      {guidance && <p className="visit-guidance" role="status">{guidance}</p>}
      <Tabs
        label="Score input method"
        value={mode}
        onChange={(value) => onModeChange(value as InputMode)}
        items={[
          {
            label: "Board",
            id: "board",
            content: <p className="input-guidance">Tap the board to record the exact landing point.</p>,
          },
          {
            label: "Visit total",
            id: "score",
            content: (
              <form className="aggregate-form" onSubmit={submitAggregate} noValidate>
                <TextField
                  label="Visit total"
                  inputMode="numeric"
                  value={score}
                  onChange={(event) => setScore(event.target.value)}
                  placeholder="0–180"
                  error={error ?? undefined}
                  disabled={disabled}
                />
                <SegmentedControl
                  className="darts-thrown"
                  label="Darts thrown"
                  value={dartsThrown}
                  onChange={setDartsThrown}
                  options={[
                    { label: "1 dart", value: "1" },
                    { label: "2 darts", value: "2" },
                    { label: "3 darts", value: "3" },
                  ]}
                />
                <Button type="submit" disabled={disabled}>Record visit</Button>
              </form>
            ),
          },
          {
            label: "Each dart",
            id: "darts",
            content: <DartInputPad disabled={disabled} onDart={onDart} />,
          },
        ]}
      />
    </Surface>
  );
}
