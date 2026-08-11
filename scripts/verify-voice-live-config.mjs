import {
  hasPrivateNoStore,
  resolveCredentialedLiveConfiguration,
} from "./verify-live-configuration.mjs";

export { hasPrivateNoStore };

export function resolveLiveVoiceConfiguration(arguments_, environment) {
  return resolveCredentialedLiveConfiguration(
    arguments_,
    environment,
    "usage: pnpm verify:voice:live <deployment-origin>",
  );
}

/**
 * Accepts only the expected spoken T20 result without returning or logging text.
 *
 * The synthetic fixture must produce a real, non-zero model self-signal. A zero
 * remains valid at the API boundary as the fail-closed value for missing provider
 * evidence, but cannot prove that the deployed provider returned logprobs.
 */
export function isExpectedTrebleTwentyVoiceSuccess(payload) {
  if (!isRecordWithKeys(payload, ["command", "confidence", "transcript"])) return false;
  if (
    typeof payload.transcript !== "string"
    || payload.transcript.trim() === ""
    || typeof payload.confidence !== "number"
    || !Number.isFinite(payload.confidence)
    || payload.confidence <= 0
    || payload.confidence > 1
  ) {
    return false;
  }
  return isRecordWithKeys(payload.command, ["multiplier", "segment", "type"])
    && payload.command.type === "dart"
    && payload.command.segment === 20
    && payload.command.multiplier === 3;
}

function isRecordWithKeys(value, expectedKeys) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index]);
}
