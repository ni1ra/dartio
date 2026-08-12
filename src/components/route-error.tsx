"use client";

import Link from "next/link";

interface RouteErrorProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly children: React.ReactNode;
  readonly backHref: string;
  readonly backLabel: string;
  readonly preservationNote: string;
  readonly onRetry: () => void;
}

/** A recovery surface whose actions preserve every on-device match slot. */
export function RouteError({ eyebrow, title, children, backHref, backLabel, preservationNote, onRetry }: RouteErrorProps) {
  return <main className="page-frame route-error" role="alert" aria-labelledby="route-error-title">
    <div className="route-error__signal" aria-hidden="true"><span>!</span></div>
    <div className="route-error__copy">
      <span className="eyebrow">{eyebrow}</span>
      <h1 id="route-error-title">{title}</h1>
      <div className="route-error__detail">{children}</div>
      <div className="route-error__actions">
        <button className="button-link" type="button" onClick={onRetry}>Try again</button>
        <Link className="button-link button-link-secondary" href={backHref}>{backLabel}</Link>
      </div>
      <small>{preservationNote}</small>
    </div>
  </main>;
}
