import type { Metadata } from "next";
import Link from "next/link";
import { Surface } from "navi-ui";
export const metadata:Metadata={title:"Your account"};
export default function AccountPage(){return <div className="page-frame account-page"><header className="page-heading"><p className="eyebrow">Your Dartio</p><h1>Keep the rhythm<br/>across every board.</h1><p>An account will sync matches, training, rooms, and membership. Local play never waits for sign-in.</p></header><Surface className="account-placeholder"><div className="account-glyph" aria-hidden="true">↗</div><div><h2>Account sync is being wired.</h2><p>Authentication is intentionally not simulated. Until the production boundary is connected, your games stay private on this device.</p><div><Link className="button-link" href="/play">Play without an account</Link><Link className="button-link button-link-secondary" href="/pricing">See membership</Link></div></div></Surface></div>}
