"use client";

import { useState } from "react";
import { SegmentedControl } from "navi-ui";
import { dart, type Dart, type Multiplier } from "@/domain";

type MultiplierChoice = "1" | "2" | "3";

type DartInputPadProps = {
  disabled?: boolean;
  onDart: (value: Dart) => void;
};

const MULTIPLIER_NAMES: Record<MultiplierChoice, string> = {
  "1": "Single",
  "2": "Double",
  "3": "Treble",
};

export function DartInputPad({ disabled = false, onDart }: DartInputPadProps) {
  const [multiplier, setMultiplier] = useState<MultiplierChoice>("3");
  const numericMultiplier = Number(multiplier) as Multiplier;

  return (
    <fieldset className="dart-input-pad" disabled={disabled}>
      <legend className="sr-only">Record each dart</legend>
      <SegmentedControl
        className="dart-multiplier"
        label="Scoring bed"
        value={multiplier}
        onChange={setMultiplier}
        options={[
          { label: "Single", value: "1" },
          { label: "Double", value: "2" },
          { label: "Treble", value: "3" },
        ]}
      />
      <div className="dart-number-grid" role="group" aria-label={`${MULTIPLIER_NAMES[multiplier]} numbers`}>
        {Array.from({ length: 20 }, (_, index) => index + 1).map((segment) => (
          <button
            type="button"
            key={segment}
            aria-label={`${MULTIPLIER_NAMES[multiplier]} ${segment}, ${segment * numericMultiplier} points`}
            onClick={() => onDart(dart(segment as Dart["segment"], numericMultiplier))}
          >
            {segment}
          </button>
        ))}
      </div>
      <div className="dart-special-grid" role="group" aria-label="Bull and miss">
        <button type="button" aria-label="Single bull, 25 points" onClick={() => onDart(dart(25))}>
          <b>SB</b><span>25</span>
        </button>
        <button type="button" aria-label="Double bull, 50 points" onClick={() => onDart(dart(25, 2))}>
          <b>DB</b><span>50</span>
        </button>
        <button type="button" aria-label="Miss, 0 points" onClick={() => onDart(dart(0))}>
          <b>MISS</b><span>0</span>
        </button>
      </div>
    </fieldset>
  );
}
