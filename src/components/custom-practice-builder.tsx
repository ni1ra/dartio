"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, SegmentedControl, SelectField, Surface } from "navi-ui";
import {
  CUSTOM_PRACTICE_MAX_TARGETS,
  encodeCustomPracticePath,
  practiceTargetNotation,
  type Multiplier,
  type PracticeTarget,
} from "@/domain";
import { hasAccessEntitlement, isProductAvailable } from "@/lib/product/access-contract";
import { useAccess } from "./access-provider";

const SEGMENTS = [...Array.from({ length: 20 }, (_, index) => index + 1), 25] as const;

/** A deliberately small sequence builder; custom practice is beds, not a rule language. */
export function CustomPracticeBuilder() {
  const access = useAccess();
  const [segment, setSegment] = useState(20);
  const [multiplier, setMultiplier] = useState<Multiplier>(3);
  const [targets, setTargets] = useState<readonly PracticeTarget[]>([]);
  const available = access.status === "ready"
    && isProductAvailable(access.snapshot, "customPractice")
    && hasAccessEntitlement(access.snapshot, "custom_practice");

  function chooseSegment(value: string) {
    const next = Number(value);
    setSegment(next);
    if (next === 25 && multiplier === 3) setMultiplier(2);
  }

  function addTarget() {
    if (targets.length >= CUSTOM_PRACTICE_MAX_TARGETS) return;
    setTargets((current) => [...current, { segment: segment as PracticeTarget["segment"], multiplier }]);
  }

  return <Surface className="custom-practice-builder" tone="raised">
    <header>
      <span className="catalog-number">10</span>
      <div>
        <p className="eyebrow">Pro · custom practice</p>
        <h2>Build the beds you need.</h2>
        <p>Choose 1–12 scoring beds in order. You get three darts at each, and the first exact hit moves you on.</p>
      </div>
    </header>

    {access.status === "loading" ? <p role="status" className="custom-practice-state">Checking custom-practice access…</p>
      : access.status === "unavailable" ? <div className="custom-practice-state" role="alert">
        <span>Membership authority is unavailable. No practice path was changed.</span>
        <Button variant="secondary" onClick={() => void access.retry()} disabled={access.refreshing}>
          {access.refreshing ? "Retrying…" : "Retry access"}
        </Button>
      </div>
        : !available ? <div className="custom-practice-state locked">
          <span>Custom paths are a Pro tool. The nine fixed games and drills remain playable without it.</span>
          <Link className="button-link button-link-secondary" href="/pricing">View Pro</Link>
        </div>
          : <>
            <div className="custom-practice-controls">
              <SelectField
                label="Target number"
                value={String(segment)}
                onChange={(event) => chooseSegment(event.target.value)}
                options={SEGMENTS.map((value) => ({ value: String(value), label: value === 25 ? "Bull" : String(value) }))}
              />
              <SegmentedControl
                label="Target ring"
                value={String(multiplier)}
                onChange={(value) => setMultiplier(Number(value) as Multiplier)}
                options={[
                  { label: "Single", value: "1" },
                  { label: "Double", value: "2" },
                  ...(segment === 25 ? [] : [{ label: "Treble", value: "3" }]),
                ]}
              />
              <Button onClick={addTarget} disabled={targets.length >= CUSTOM_PRACTICE_MAX_TARGETS}>
                Add {practiceTargetNotation({ segment: segment as PracticeTarget["segment"], multiplier })}
              </Button>
            </div>

            <div className="custom-practice-path" aria-live="polite">
              <div><b>Your path</b><span>{targets.length} / {CUSTOM_PRACTICE_MAX_TARGETS} targets</span></div>
              {targets.length === 0 ? <p>Add the first bed. The order shown here is the order you will throw.</p> : <ol>
                {targets.map((target, index) => <li key={`${index}-${practiceTargetNotation(target)}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{practiceTargetNotation(target)}</strong>
                  <button
                    type="button"
                    aria-label={`Remove target ${index + 1}, ${practiceTargetNotation(target)}`}
                    onClick={() => setTargets((current) => current.filter((_, targetIndex) => targetIndex !== index))}
                  >Remove</button>
                </li>)}
              </ol>}
            </div>

            {targets.length > 0
              ? <Link className="button-link custom-practice-start" href={`/play/match?custom=${encodeCustomPracticePath(targets)}`}>Walk this path →</Link>
              : <Button disabled>Walk this path →</Button>}
          </>}
  </Surface>;
}
