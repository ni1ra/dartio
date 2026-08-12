"use client";

import { RouteError } from "@/components/route-error";

export default function Error({ reset }: { readonly reset: () => void }) {
  return <RouteError
    eyebrow="Page interrupted"
    title="The board went quiet."
    backHref="/"
    backLabel="Return home"
    preservationNote="Neither action clears account or on-device data."
    onRetry={reset}
  >
    <p>This page could not finish loading. Retrying does not clear account or on-device data.</p>
  </RouteError>;
}
