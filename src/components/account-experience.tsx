"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Surface } from "navi-ui";
import { openBillingPortal } from "./billing-client";

const authClient = createAuthClient();

export function AccountExperience() {
  const { data, error, isPending, refetch } = authClient.useSession();
  const params = useSearchParams();
  const [action, setAction] = useState<"idle" | "portal" | "signout">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const user = data?.user;

  async function manageBilling() {
    setAction("portal"); setActionError(null);
    try { window.location.assign(await openBillingPortal()); }
    catch (problem) { setActionError(problem instanceof Error ? problem.message : "Billing management is unavailable"); setAction("idle"); }
  }

  async function signOut() {
    setAction("signout"); setActionError(null);
    const result = await authClient.signOut();
    if (result.error) { setActionError(result.error.message ?? "Sign-out failed"); setAction("idle"); return; }
    await refetch(); setAction("idle");
  }

  return <div className="page-frame account-page account-v2">
    <header className="page-heading account-heading"><div><p className="eyebrow">Your Dartio</p><h1>One identity.<br/><em>Every oche.</em></h1></div><p>Keep your membership, rooms, match history, and training continuity attached to you—not to one browser.</p></header>
    {params.get("checkout")==="success"&&<div className="account-success" role="status"><span>✓</span><div><b>Checkout returned successfully.</b><p>Stripe is confirming the subscription. Billing access may take a moment while the signed webhook updates Dartio.</p></div></div>}
    {isPending ? <AccountLoading /> : error ? <AccountError message={error.message} retry={()=>void refetch()} /> : user ? <SignedInAccount name={user.name} email={user.email} action={action} actionError={actionError} manageBilling={manageBilling} signOut={signOut} /> : <SignedOutAccount />}
  </div>;
}

function AccountLoading(){return <Surface className="account-state account-loading" aria-busy="true"><div className="account-avatar skeleton"/><div><span className="skeleton skeleton-line short"/><span className="skeleton skeleton-line"/><span className="skeleton skeleton-line medium"/></div><p role="status">Checking your secure session…</p></Surface>}

function AccountError({message,retry}:{message:string;retry:()=>void}){return <Surface className="account-state account-error" tone="raised"><span className="account-state-code">SESSION / ERROR</span><div><h2>We couldn’t read your account.</h2><p>{message || "The auth service did not return a usable session."} Your local games are unaffected.</p><Button onClick={retry}>Try session again</Button></div></Surface>}

function SignedOutAccount(){return <div className="account-signed-out"><Surface className="account-state" tone="raised"><div className="account-avatar guest" aria-hidden="true">↗</div><div><span className="account-state-code">SIGNED OUT</span><h2>Your board still works.<br/>Your continuity is waiting.</h2><p>Sign in to recover rooms, manage membership, and carry history between devices. Local scoring never requires an account.</p><div className="account-actions"><Link className="button-link" href="/auth/sign-in">Sign in securely</Link><Link className="button-link button-link-secondary" href="/play">Play locally</Link></div></div></Surface><aside><b>What sign-in unlocks</b><ol><li><span>01</span>Membership and billing control</li><li><span>02</span>Cross-device match history</li><li><span>03</span>Voice and online-room access</li></ol></aside></div>}

function SignedInAccount({name,email,action,actionError,manageBilling,signOut}:{name?:string|null;email:string;action:"idle"|"portal"|"signout";actionError:string|null;manageBilling:()=>void;signOut:()=>void}){const initial=(name?.trim()||email).slice(0,1).toUpperCase();return <div className="account-signed-in"><Surface className="identity-card" tone="raised"><div className="account-avatar">{initial}</div><div className="identity-copy"><span className="account-state-code">VERIFIED IDENTITY</span><h2>{name?.trim()||"Dartio player"}</h2><p>{email}</p></div><span className="identity-signal"><i/> Active session</span></Surface><div className="account-command-grid"><Surface className="membership-command"><span className="command-index">01</span><div><h3>Membership control</h3><p>Open Stripe’s secure portal to review the authoritative subscription, invoices, payment method, or cancellation.</p></div><Button onClick={manageBilling} disabled={action!=="idle"}>{action==="portal"?"Opening Stripe…":"Manage billing"}</Button></Surface><Surface className="privacy-command"><span className="command-index">02</span><div><h3>Session privacy</h3><p>Sign out on shared hardware. This ends the web session; local match state on this device is not uploaded automatically.</p></div><Button variant="secondary" onClick={signOut} disabled={action!=="idle"}>{action==="signout"?"Signing out…":"Sign out"}</Button></Surface></div>{actionError&&<p className="account-action-error" role="alert">{actionError}</p>}<p className="account-trust">Identity is provided by Neon Auth. Subscription status remains authoritative in Stripe and Dartio’s signed webhook projection.</p></div>}
