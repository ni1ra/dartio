import { resolveCredentialedLiveConfiguration } from "./verify-live-configuration.mjs";

export const HISTORY_REQUEST_TIMEOUT_MS = 40_000;

/** Resolves the credential-bearing history gate before it can touch the network. */
export function resolveHistoryConfiguration(arguments_, environment) {
  return resolveCredentialedLiveConfiguration(
    arguments_,
    environment,
    "usage: pnpm verify:history <deployment-origin>",
  );
}

/** Forces every history request to fail closed on a redirect or a stalled gate. */
export function secureHistoryRequestInit(init = {}) {
  return {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(HISTORY_REQUEST_TIMEOUT_MS),
  };
}
