"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Surface } from "navi-ui";
import { hasAccessEntitlement, hasPaidMembership, isProductAvailable } from "@/lib/product/access-contract";
import { CheckIcon, UserIcon } from "./icons";
import { useAccess } from "./access-provider";
import { openBillingPortal } from "./billing-client";
import { PlayerStats } from "./player-stats";

const authClient = createAuthClient();

export function AccountExperience() {
  const access = useAccess();
  const { data, error, isPending, refetch } = authClient.useSession();
  const params = useSearchParams();
  const [action, setAction] = useState<"idle" | "portal" | "signout">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const user = data?.user;
  const checkoutSuccess = params.get("checkout") === "success";
  const refreshAccess = access.refresh;
  const checkoutRefreshStarted = useRef(false);

  useEffect(() => {
    if (!checkoutSuccess || !user || checkoutRefreshStarted.current) return;
    checkoutRefreshStarted.current = true;
    const timers = [0, 1500, 4000].map((delay) => window.setTimeout(() => void refreshAccess(), delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [checkoutSuccess, user, refreshAccess]);

  async function manageBilling() {
    setAction("portal"); setActionError(null);
    try { window.location.assign(await openBillingPortal()); }
    catch (problem) { setActionError(problem instanceof Error ? problem.message : "Billing management is unavailable"); setAction("idle"); }
  }

  async function signOut() {
    setAction("signout"); setActionError(null);
    const result = await authClient.signOut();
    if (result.error) { setActionError(result.error.message ?? "Sign-out failed"); setAction("idle"); return; }
    await refetch(); await access.refresh(); setAction("idle");
  }

  return <div className="page-frame account-page account-v2">
    <header className="page-heading account-heading"><div><p className="eyebrow">Your Dartio</p><h1>One identity.<br/><em>Every oche.</em></h1></div><p>Your membership, your record, and the matches behind it. Online rooms are still being built.</p></header>
    {checkoutSuccess&&<div className="account-success" role="status"><span><CheckIcon /></span><div><b>Checkout returned successfully.</b><p>{access.status==="ready"&&hasPaidMembership(access.snapshot)?"The signed webhook has confirmed your paid access.":"Stripe is confirming the subscription. Access may take a moment while the signed webhook updates Dartio."}</p><button type="button" onClick={()=>void access.refresh()} disabled={access.refreshing}>{access.refreshing?"Refreshing…":"Refresh membership"}</button></div></div>}
    {isPending ? <AccountLoading /> : error ? <AccountError message={error.message} retry={()=>void refetch()} /> : user ? <SignedInAccount name={user.name} email={user.email} action={action} actionError={actionError} manageBilling={manageBilling} signOut={signOut} access={access} /> : <SignedOutAccount />}
  </div>;
}

function AccountLoading(){return <Surface className="account-state account-loading" aria-busy="true"><div className="account-avatar skeleton"/><div><span className="skeleton skeleton-line short"/><span className="skeleton skeleton-line"/><span className="skeleton skeleton-line medium"/></div><p role="status">Checking your secure session…</p></Surface>}

function AccountError({message,retry}:{message:string;retry:()=>void}){return <Surface className="account-state account-error" tone="raised"><span className="account-state-code">SESSION / ERROR</span><div><h2>We couldn’t read your account.</h2><p>{message || "The auth service did not return a usable session."} Your local games are unaffected.</p><Button onClick={retry}>Try session again</Button></div></Surface>}

function SignedOutAccount(){return <div className="account-signed-out"><Surface className="account-state" tone="raised"><div className="account-avatar guest" aria-hidden="true"><UserIcon /></div><div><span className="account-state-code">SIGNED OUT</span><h2>Your board still works.<br/>Membership waits for sign-in.</h2><p>Sign in to manage billing and use paid AI, voice, and checkout features. Local scoring never requires an account.</p><div className="account-actions"><Link className="button-link" href="/auth/sign-in">Sign in securely</Link><Link className="button-link button-link-secondary" href="/play">Play locally</Link></div></div></Surface><aside><b>What sign-in unlocks</b><ol><li><span>01</span>Membership and billing control</li><li><span>02</span>Pro AI, voice, and checkout access</li><li><span>03</span>Your match history and career numbers</li></ol></aside></div>}

function SignedInAccount({name,email,action,actionError,manageBilling,signOut,access}:{name?:string|null;email:string;action:"idle"|"portal"|"signout";actionError:string|null;manageBilling:()=>void;signOut:()=>void;access:ReturnType<typeof useAccess>}){const initial=(name?.trim()||email).slice(0,1).toUpperCase(),paid=access.status==="ready"&&hasPaidMembership(access.snapshot);return <div className="account-signed-in"><Surface className="identity-card" tone="raised"><div className="account-avatar">{initial}</div><div className="identity-copy"><span className="account-state-code">VERIFIED IDENTITY</span><h2>{name?.trim()||"Dartio player"}</h2><p>{email}</p></div><span className="identity-signal"><i/> Active session</span></Surface><div className="account-command-grid"><Surface className="membership-command"><span className="command-index">01</span><div><h3>Membership</h3><MembershipStatus access={access}/></div>{access.status==="ready"&&!paid?<Link className="button-link" href="/pricing">View Pro</Link>:<Button onClick={manageBilling} disabled={action!=="idle"}>{action==="portal"?"Opening Stripe…":"Manage billing"}</Button>}</Surface><Surface className="privacy-command"><span className="command-index">02</span><div><h3>Session privacy</h3><p>Sign out on shared hardware. This ends the web session; local match state on this device is not uploaded automatically.</p></div><Button variant="secondary" onClick={signOut} disabled={action!=="idle"}>{action==="signout"?"Signing out…":"Sign out"}</Button></Surface></div><PlayerStats />{actionError&&<p className="account-action-error" role="alert">{actionError}</p>}<p className="account-trust">Identity is provided by Neon Auth. Subscription status remains authoritative in Stripe and Dartio’s signed webhook projection.</p></div>}

function MembershipStatus({access}:{access:ReturnType<typeof useAccess>}){if(access.status==="loading")return <p className="membership-status" role="status">Checking membership…</p>;if(access.status==="unavailable")return <div className="membership-status unavailable"><p>Paid access could not be verified. This does not mean your plan changed.</p><button type="button" onClick={()=>void access.retry()}>Retry access</button></div>;const {snapshot}=access,features=[isProductAvailable(snapshot,"advancedAi")&&hasAccessEntitlement(snapshot,"advanced_ai")?"AI levels 1–20":null,isProductAvailable(snapshot,"advancedCheckout")&&hasAccessEntitlement(snapshot,"advanced_checkout")?"Advanced checkout":null,isProductAvailable(snapshot,"voiceInput")&&hasAccessEntitlement(snapshot,"voice_always_on")?"Voice scoring":null].filter(Boolean);const ends=snapshot.accessEndsAt?new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(new Date(snapshot.accessEndsAt)):null;return <div className="membership-status"><p><strong>{snapshot.effectivePlan.toUpperCase()}</strong> · {snapshot.accessState==="grace"?"grace access":snapshot.accessState}</p>{features.length>0&&<p>{features.join(" · ")}</p>}{snapshot.cancelAtPeriodEnd&&<p>Cancellation scheduled{ends?` · access through ${ends}`:""}.</p>}{snapshot.accessState==="grace"&&ends&&<p>Paid access is available through {ends} while billing needs attention.</p>}<small>Rooms and Club management are still being built.</small></div>}
