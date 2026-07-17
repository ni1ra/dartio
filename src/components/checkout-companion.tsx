"use client";

import { useState } from "react";
import { Surface } from "navi-ui";
import {
  notation,
  type CheckoutAdvice,
  type CheckoutRoutePlan,
  type CheckoutSetupPlan,
} from "@/domain";

type CheckoutPlan = CheckoutRoutePlan | CheckoutSetupPlan;

type CheckoutCompanionProps = {
  advice: CheckoutAdvice;
  playerName: string;
  interactive?: boolean;
};

function planKey(plan: CheckoutPlan) {
  return plan.darts.map(notation).join(" ");
}

export function CheckoutCompanion({
  advice,
  playerName,
  interactive = true,
}: CheckoutCompanionProps) {
  const [selection, setSelection] = useState({ adviceKey: "", planKey: "" });
  const plans: readonly CheckoutPlan[] = advice.primaryPlan
    ? [advice.primaryPlan, ...advice.alternatePlans]
    : advice.setupPlan
      ? [advice.setupPlan]
      : [];
  const adviceKey = `${advice.score}:${advice.dartsAvailable}:${plans.map(planKey).join("|")}`;
  const selectedPlan =
    (selection.adviceKey === adviceKey
      ? plans.find((plan) => planKey(plan) === selection.planKey)
      : null) ?? plans[0] ?? null;
  const selectedPlanKey = selectedPlan ? planKey(selectedPlan) : "";
  const state = advice.checkout
    ? "FINISH AVAILABLE"
    : advice.bogey
      ? "NO FINISH"
      : advice.setupPlan?.reasonCodes.includes("next-visit-finish")
        ? "SETUP"
        : "SCORING PHASE";
  const liveSummary = selectedPlan
    ? `${playerName}: ${advice.score} remaining, ${advice.dartsAvailable} ${advice.dartsAvailable === 1 ? "dart" : "darts"} in hand. ${selectedPlanKey}. ${selectedPlan.leave === 0 ? "Finish available" : `Projected leave ${selectedPlan.leave}`}.`
    : `${playerName}: ${advice.score} remaining, ${advice.dartsAvailable} ${advice.dartsAvailable === 1 ? "dart" : "darts"} in hand. ${advice.explanation}`;

  return (
    <Surface
      className={`checkout-panel ${advice.checkout ? "checkout" : advice.bogey ? "bogey" : advice.setupPlan ? "setup" : "scoring"}`}
      aria-labelledby="checkout-heading"
    >
      <header className="checkout-heading">
        <div>
          <span>{state}</span>
          <h2 id="checkout-heading">Checkout companion</h2>
        </div>
        <div className="checkout-owner">
          <strong>{advice.score}</strong>
          <span>{playerName} · remaining</span>
        </div>
      </header>

      {selectedPlan ? (
        <div className="checkout-plan">
          <ol
            className="checkout-plan__darts"
            aria-label={`Selected route: ${selectedPlanKey}`}
          >
            {selectedPlan.darts.map((value, index) => (
              <li className="checkout-plan__dart" key={`${notation(value)}-${index}`}>
                {notation(value)}
              </li>
            ))}
          </ol>
          <div className="checkout-leave">
            <span>{selectedPlan.leave === 0 ? "Outcome" : "Projected leave"}</span>
            <strong>{selectedPlan.leave === 0 ? "Finish" : selectedPlan.leave}</strong>
          </div>
        </div>
      ) : (
        <p className="checkout-empty">
          Keep building the score. A ranked route will appear as soon as one is available.
        </p>
      )}

      <div className="checkout-meta">
        <span>
          {advice.dartsAvailable} {advice.dartsAvailable === 1 ? "dart" : "darts"} in hand
        </span>
        {!interactive && <span>Navigator route · read only</span>}
      </div>
      <p className="checkout-explanation">
        {selectedPlan?.explanation ?? advice.explanation}
      </p>

      {interactive && advice.alternatePlans.length > 0 && (
        <div className="checkout-alternates" role="group" aria-label="Checkout routes">
          <span>ROUTE OPTIONS</span>
          <div>
            {[advice.primaryPlan!, ...advice.alternatePlans].map((plan) => {
              const key = planKey(plan);
              return (
                <button
                  type="button"
                  className="checkout-alternate"
                  aria-pressed={key === selectedPlanKey}
                  onClick={() => setSelection({ adviceKey, planKey: key })}
                  key={key}
                >
                  {key}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveSummary}
      </p>
    </Surface>
  );
}
