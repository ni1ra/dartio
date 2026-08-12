"use client";

import { RouteError } from "@/components/route-error";

export default function MatchError({ reset }: { readonly reset: () => void }) {
  return <RouteError
    eyebrow="Match interrupted"
    title="Your saved match is still here."
    backHref="/play"
    backLabel="Back to setup"
    preservationNote="Neither action clears saved match data."
    onRetry={reset}
  >
    <p>Darts already saved on this device are untouched. In a room, every submitted visit remains on the server.</p>
    <p>A dart still waiting to be submitted may need to be thrown again.</p>
  </RouteError>;
}
