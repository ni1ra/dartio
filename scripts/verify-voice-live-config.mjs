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
  return classifyTrebleTwentyVoiceSuccess(payload) === "expected";
}

/** Separates provider variance from a malformed public response without logging either. */
export function classifyTrebleTwentyVoiceSuccess(payload) {
  if (!isRecordWithKeys(payload, ["command", "confidence", "transcript"])) return "malformed";
  if (
    typeof payload.transcript !== "string"
    || payload.transcript.trim() === ""
    || typeof payload.confidence !== "number"
    || !Number.isFinite(payload.confidence)
    || payload.confidence <= 0
    || payload.confidence > 1
  ) {
    return "malformed";
  }
  // A clean transcript can legitimately be outside Dartio's vocabulary. That
  // is provider variance worth one bounded retry, not a malformed API body.
  if (payload.command === null) return "unexpected";
  if (!isValidVoiceCommand(payload.command)) return "malformed";
  return payload.command.type === "dart"
    && payload.command.segment === 20
    && payload.command.multiplier === 3
    ? "expected"
    : "unexpected";
}

function isValidVoiceCommand(command) {
  if (typeof command !== "object" || command === null || Array.isArray(command)) return false;
  if (["undo", "next_player", "confirm", "cancel"].includes(command.type)) {
    return isRecordWithKeys(command, ["type"]);
  }
  if (command.type === "turn_score") {
    return isRecordWithKeys(command, ["score", "type"])
      && Number.isInteger(command.score)
      && command.score >= 0
      && command.score <= 180;
  }
  if (command.type !== "dart" || !isRecordWithKeys(command, ["multiplier", "segment", "type"])) return false;
  if (!Number.isInteger(command.segment) || ![1, 2, 3].includes(command.multiplier)) return false;
  return command.segment === 0
    ? command.multiplier === 1
    : command.segment === 25
      ? command.multiplier !== 3
      : command.segment >= 1 && command.segment <= 20;
}

function isRecordWithKeys(value, expectedKeys) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index]);
}
