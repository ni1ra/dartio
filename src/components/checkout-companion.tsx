"use client";

import { useState } from "react";
import { Surface } from "navi-ui";
import {
  notation,
  type CheckoutAdvice,
  type CheckoutRoutePlan,
  type CheckoutSetupPlan,
} from "@/domain";
import type { CheckoutPersonalizationReceipt } from "@/lib/product/checkout-personalization";

type CheckoutPlan = CheckoutRoutePlan | CheckoutSetupPlan;

/**
 * `basic` is the Free plan: one ranked route, no alternates, no setup planning.
 * `advanced` is rendered only from a server-authorized response, so the tier is
 * passed in rather than derived here — a component must not decide its own
 * entitlement.
 */
export type CheckoutTier = "basic" | "advanced";

type CheckoutCompanionProps = {
  advice: CheckoutAdvice;
  playerName: string;
  interactive?: boolean;
  tier?: CheckoutTier;
  /** True while the advanced route request for this position is still in flight. */
  upgrading?: boolean;
  /** Offered only to the signed-in seat whose history the server owns. */
  personalizationAvailable?: boolean;
  personalizationEnabled?: boolean;
  personalization?: CheckoutPersonalizationReceipt | null;
  onPersonalizationChange?: (enabled: boolean) => void;
};

function planKey(plan: CheckoutPlan) {
  return plan.darts.map(notation).join(" ");
}

export function CheckoutCompanion({
  advice,
  playerName,
  interactive = true,
  tier = "advanced",
  upgrading = false,
  personalizationAvailable = false,
  personalizationEnabled = false,
  personalization = null,
  onPersonalizationChange,
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
      ) : null}

      <div className="checkout-meta">
        <span>
          {advice.dartsAvailable} {advice.dartsAvailable === 1 ? "dart" : "darts"} in hand
        </span>
        {!interactive && <span>Navigator route · read only</span>}
      </div>
      <p className="checkout-explanation">
        {selectedPlan?.explanation ?? advice.explanation}
      </p>

      {tier === "basic" && (
        <p className="checkout-tier-note">
          {upgrading
            ? "Loading your alternate routes and setup plans…"
            : "Alternate routes, setup-visit plans, and preferred doubles come with Pro."}
        </p>
      )}

      {personalizationAvailable && onPersonalizationChange && (
        <section className="checkout-personalization" aria-labelledby="checkout-personalization-heading">
          <button
            type="button"
            aria-pressed={personalizationEnabled}
            aria-describedby="checkout-personalization-status"
            onClick={() => onPersonalizationChange(!personalizationEnabled)}
          >
            <span>PERSONAL ROUTES</span>
            <strong id="checkout-personalization-heading">
              {personalizationEnabled ? "Using my match history" : "Use my match history"}
            </strong>
            <i aria-hidden="true">{personalizationEnabled ? "ON" : "OFF"}</i>
          </button>
          <p id="checkout-personalization-status" role="status" aria-live="polite">
            {personalizationCopy(personalizationEnabled, upgrading, personalization)}
          </p>
        </section>
      )}

      {interactive && tier === "advanced" && advice.alternatePlans.length > 0 && (
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

function personalizationCopy(
  enabled: boolean,
  upgrading: boolean,
  receipt: CheckoutPersonalizationReceipt | null,
): string {
  if (!enabled) return "Off · your history stays unread.";
  if (upgrading) return "Reading up to 50 of your owned X01 matches…";
  if (!receipt) return "Personalization request failed · the basic route remains active.";
  const evidence = `${receipt.x01Matches} X01 ${receipt.x01Matches === 1 ? "match" : "matches"} · ${receipt.exactDarts} exact darts · ${receipt.finishingDoubles} finishing ${receipt.finishingDoubles === 1 ? "double" : "doubles"}`;
  if (receipt.status === "applied") return `Personalized from ${evidence}.`;
  if (receipt.status === "sparse") return `History on · more exact darts are needed. ${evidence}.`;
  if (receipt.status === "unavailable") return "History is unavailable · standard Pro routes remain active without personalization.";
  return "Off · your history stays unread.";
}
