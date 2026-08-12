"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import Link from "next/link";
import { useState } from "react";
import { Button, Surface } from "navi-ui";
import { hasPaidMembership } from "@/lib/product/access-contract";
import { useAccess } from "./access-provider";
import { beginCheckout, openBillingPortal, type BillingInterval, type BillingPlan } from "./billing-client";

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
  const access = useAccess();
  const { data, isPending: sessionPending } = authClient.useSession();
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [checkoutPlan, setCheckoutPlan] = useState<BillingPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const authenticated = !!data?.user;
  const selected = prices[interval];
  const currentPaidMembership = access.status === "ready" && hasPaidMembership(access.snapshot);

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

  async function manageMembership() {
    setCheckoutPlan("pro"); setError(null);
    try { window.location.assign(await openBillingPortal()); }
    catch (problem) { setError(problem instanceof Error?problem.message:"Billing management is unavailable"); setCheckoutPlan(null); }
  }

  return (
    <div className="page-frame pricing-page pricing-v2">
      <header className="page-heading pricing-heading">
        <div>
          <p className="eyebrow">Membership without hostage-taking</p>
          <h1>Scoring stays free.<br /><em>Momentum goes further.</em></h1>
        </div>
        <p>Pro unlocks every AI level, advanced checkout routes, deep statistics, online rooms, and push-to-talk or opt-in hands-free voice scoring. Every paid decision stays reversible in Stripe, while custom practice and Club remain clearly marked.</p>
      </header>
      <div className="pricing-control-row">
        <fieldset className="interval-switch">
          <legend>Billing interval</legend>
          <button type="button" aria-pressed={interval === "month"} onClick={() => setInterval("month")}>Monthly</button>
          <button type="button" aria-pressed={interval === "year"} onClick={() => setInterval("year")}>Annual <span>save 20%</span></button>
        </fieldset>
        <div className={`auth-readiness ${authenticated ? "ready" : ""}`}>
          <i />
          {sessionPending ? "Checking account…" : access.status==="unavailable"&&authenticated?"Membership authority unavailable · checkout paused":authenticated ? currentPaidMembership?`Paid access active · ${data.user.email}`:`Ready for secure checkout · ${data.user.email}` : "Sign in before Stripe checkout"}
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
            <li>Saved match history and dart-by-dart replay <span>AVAILABLE</span></li>
          </ul>
          <Link className="button-link button-link-secondary" href="/play">Start a free match</Link>
        </Surface>
        <Surface className="plan-v2 pro-plan" tone="raised">
          <span className="plan-signal">14 DAYS INCLUDED</span>
          <PlanHead index="01" name="Pro" line="For the player building a sharper game." />
          <Price {...selected.pro} />
          <ul>
            <li>Every AI level, 1 through 20 <span>AVAILABLE</span></li>
            <li>Push-to-talk voice scoring <span>AVAILABLE</span></li>
            <li>Opt-in hands-free voice scoring <span>AVAILABLE</span></li>
            <li>Advanced checkout routes <span>AVAILABLE</span></li>
            <li>Deep statistics and online rooms <span>AVAILABLE</span></li>
            <li className="feature-soon">Custom practice paths <span>COMING SOON</span></li>
          </ul>
          {sessionPending || access.status==="loading" ? (
            <Button disabled>Checking account…</Button>
          ) : authenticated && access.status==="unavailable" ? (
            <Button variant="secondary" onClick={()=>void access.retry()} disabled={access.refreshing}>{access.refreshing?"Retrying membership check…":"Retry membership check"}</Button>
          ) : currentPaidMembership ? (
            <Button onClick={()=>void manageMembership()} disabled={checkoutPlan!==null}>{checkoutPlan==="pro"?"Opening billing portal…":"Manage current membership"}</Button>
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
          <span className="plan-signal">COMING SOON</span>
          <PlanHead index="02" name="Club" line="A shared operating layer for teams and venues." />
          <Price {...selected.club} />
          <ul>
            <li>Everything currently available in Pro</li>
            <li className="feature-soon">Administration for 12 members <span>COMING SOON</span></li>
            <li className="feature-soon">Shared boards and league tables <span>COMING SOON</span></li>
            <li className="feature-soon">Session continuity and onboarding <span>COMING SOON</span></li>
          </ul>
          <Button variant="secondary" disabled>Club checkout is not open yet</Button>
          <small>No payment is taken. Club management remains under active development.</small>
        </Surface>
      </div>
      <div className="pricing-assurance">
        <b>Billing truth, in plain language.</b>
        <p>Prices are EUR catalog prices. Pro checkout is available only to a signed-in account and uses Stripe’s hosted page. Club pricing is a preview; Club checkout is not open.</p>
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
