"use client";

import Link from "next/link";
import { createAuthClient } from "@neondatabase/auth/next";
import { AuthView, NeonAuthUIProvider } from "@neondatabase/auth/react/ui";
import { Surface } from "navi-ui";

const authClient = createAuthClient();

function ManagedAuth({ path }: { path: "sign-in" | "sign-up" }) {
  const signingUp = path === "sign-up";
  return (
    <div className="page-frame auth-page">
      <section className="auth-promise">
        <p className="eyebrow">Your Dartio</p>
        <h1>Take every throw<br /><em>with you.</em></h1>
        <p>{signingUp ? "Create one identity for match history, training progress, online rooms, and membership across every screen." : "Sign in to sync match history, training progress, online rooms, and membership across every screen."}</p>
        <ul><li>Keep local play free and immediate</li><li>Recover rooms after a connection drop</li><li>Control billing from one account</li></ul>
        <Link className="text-link" href="/play">Continue without an account →</Link>
      </section>
      <Surface className="auth-surface" tone="raised">
        <NeonAuthUIProvider authClient={authClient} redirectTo="/account">
          <AuthView path={path} />
        </NeonAuthUIProvider>
        <p className="auth-privacy">Authentication is handled by Dartio’s Neon Auth service. Passwords and social credentials are never stored by this interface.</p>
      </Surface>
    </div>
  );
}

export function ManagedSignIn() { return <ManagedAuth path="sign-in" />; }
export function ManagedSignUp() { return <ManagedAuth path="sign-up" />; }
