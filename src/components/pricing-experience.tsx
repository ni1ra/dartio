"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import Link from "next/link";
import { useState } from "react";
import { Button, Surface } from "navi-ui";
import { beginCheckout, type BillingInterval, type BillingPlan } from "./billing-client";

const authClient = createAuthClient();
const prices = {
  month: {
    pro: { major: "7", minor: "99", note: "each month" },
    club: { major: "24", minor: "00", note: "each month" },
  },
  year: {
    pro: { major: "76", minor: "70", note: "per year · €6.39/mo" },
    club: { major: "230", minor: "40", note: "per year · €19.20/mo" },
  },
} as const;

export function PricingExperience() {
  const { data, isPending: sessionPending } = authClient.useSession();
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [checkoutPlan, setCheckoutPlan] = useState<BillingPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const authenticated = !!data?.user;
  const selected = prices[interval];

  async function choosePlan(plan: BillingPlan) {
    setCheckoutPlan(plan);
    setError(null);
    try {
      window.location.assign(await beginCheckout(plan, interval));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Checkout is unavailable");
      setCheckoutPlan(null);
    }
  }

  return (
    <div className="page-frame pricing-page pricing-v2">
      <header className="page-heading pricing-heading">
        <div>
          <p className="eyebrow">Membership without hostage-taking</p>
          <h1>Scoring stays free.<br /><em>Momentum goes further.</em></h1>
        </div>
        <p>Upgrade for deeper practice, hands-free play, and rooms that follow your group. Every paid decision stays reversible in Stripe.</p>
      </header>
      <div className="pricing-control-row">
        <fieldset className="interval-switch">
          <legend>Billing interval</legend>
          <button type="button" aria-pressed={interval === "month"} onClick={() => setInterval("month")}>Monthly</button>
          <button type="button" aria-pressed={interval === "year"} onClick={() => setInterval("year")}>Annual <span>save 20%</span></button>
        </fieldset>
        <div className={`auth-readiness ${authenticated ? "ready" : ""}`}>
          <i />
          {sessionPending ? "Checking account…" : authenticated ? `Ready for secure checkout · ${data.user.email}` : "Sign in before Stripe checkout"}
        </div>
      </div>
      {error && (
        <div className="pricing-error" role="alert">
          <b>Checkout didn’t open.</b>
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      <div className="plan-stage">
        <Surface className="plan-v2 free-plan">
          <PlanHead index="00" name="Free" line="The complete local scoring table." />
          <Price major="0" minor="00" note="forever" />
          <ul>
            <li>Unlimited local X01 scoring</li>
            <li>AI opponents through level 8</li>
            <li>Basic checkout guidance</li>
            <li>50-match local history</li>
          </ul>
          <Link className="button-link button-link-secondary" href="/play">Start a free match</Link>
        </Surface>
        <Surface className="plan-v2 pro-plan" tone="raised">
          <span className="plan-signal">14 DAYS INCLUDED</span>
          <PlanHead index="01" name="Pro" line="For the player building a sharper game." />
          <Price {...selected.pro} />
          <ul>
            <li>Every AI level, 1 through 20</li>
            <li>Always-on and push-to-talk voice</li>
            <li>Advanced checkout and practice paths</li>
            <li>Deep stats plus online rooms for 8</li>
          </ul>
          {sessionPending ? (
            <Button disabled>Checking account…</Button>
          ) : authenticated ? (
            <Button onClick={() => void choosePlan("pro")} disabled={checkoutPlan !== null}>
              {checkoutPlan === "pro" ? "Opening secure checkout…" : `Start Pro · ${interval === "year" ? "annual" : "monthly"}`}
            </Button>
          ) : (
            <Link className="button-link" href="/auth/sign-in">Sign in to start Pro</Link>
          )}
          <small>Promotion codes accepted · automatic tax at checkout · cancel in Portal</small>
        </Surface>
        <Surface className="plan-v2 club-plan">
          <PlanHead index="02" name="Club" line="A shared operating layer for teams and venues." />
          <Price {...selected.club} />
          <ul>
            <li>Everything in Pro for 12 members</li>
            <li>Club administration and shared boards</li>
            <li>League tables and session continuity</li>
            <li>Priority onboarding for the first session</li>
          </ul>
          {sessionPending ? (
            <Button variant="secondary" disabled>Checking account…</Button>
          ) : authenticated ? (
            <Button variant="secondary" onClick={() => void choosePlan("club")} disabled={checkoutPlan !== null}>
              {checkoutPlan === "club" ? "Opening secure checkout…" : `Start Club · ${interval === "year" ? "annual" : "monthly"}`}
            </Button>
          ) : (
            <Link className="button-link button-link-secondary" href="/auth/sign-in">Sign in to start Club</Link>
          )}
          <small>Secure Stripe checkout · includes 12 members · manage or cancel in Portal</small>
        </Surface>
      </div>
      <div className="pricing-assurance">
        <b>Billing truth, in plain language.</b>
        <p>Prices are EUR catalog prices. Pro and Club Checkout are available only to a signed-in account and use Stripe’s hosted page. Live-mode charging stays disabled until sandbox webhook and Portal evidence passes.</p>
      </div>
    </div>
  );
}

function PlanHead({ index, name, line }: { index: string; name: string; line: string }) {
  return <header className="plan-head"><span>{index}</span><div><h2>{name}</h2><p>{line}</p></div></header>;
}

function Price({ major, minor, note }: { major: string; minor: string; note: string }) {
  return <div className="price-v2"><span>€</span><strong>{major}</strong><sup>{minor}</sup><small>{note}</small></div>;
}
