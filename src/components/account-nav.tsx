"use client";

import Link from "next/link";
import { createAuthClient } from "@neondatabase/auth/next";

/**
 * The way into an account, from the top bar.
 *
 * There was none. `/auth/sign-in` and `/account` both existed and worked, but
 * nothing on the site linked to either above 760px, so the only route to
 * signing in was typing the URL. Everything the product charges for is behind
 * that door.
 *
 * Rendered from the live session rather than from a redirect: a signed-out
 * visitor gets "Sign in", a signed-in one gets their account. While the session
 * is still resolving it shows the neutral label rather than flickering from one
 * to the other.
 */
const authClient = createAuthClient();

export function AccountNav() {
  const { data, isPending } = authClient.useSession();
  const user = data?.user;

  if (isPending) {
    return <span className="account-nav account-nav--pending" aria-live="polite">Account</span>;
  }

  if (!user) {
    return (
      <>
        <Link className="account-nav" href="/auth/sign-in">Sign in</Link>
        <Link className="button-link button-link-secondary account-nav__signup" href="/auth/sign-up">Sign up</Link>
      </>
    );
  }

  const label = user.name?.trim() || user.email || "Account";
  return (
    <Link className="account-nav account-nav--signed-in" href="/account" aria-label={`Account: ${label}`}>
      <span className="account-nav__avatar" aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>
      <span className="account-nav__label">{label}</span>
    </Link>
  );
}
