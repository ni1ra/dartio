export interface TranscriptionTokenLogprob {
  readonly logprob?: unknown;
}

/**
 * Turns token log-likelihoods into one utterance-level confidence signal.
 *
 * Averaging in log space and exponentiating produces the geometric mean token
 * probability, so longer commands are not penalized merely for having more
 * tokens. This is the model's self-signal, not a calibrated probability that
 * the resulting dart command is correct. A log probability cannot exceed zero;
 * malformed or incomplete provider data therefore fails closed to zero instead
 * of authorizing a score.
 */
export function confidenceFromLogprobs(
  logprobs: readonly (TranscriptionTokenLogprob | null | undefined)[] | null | undefined,
): number {
  if (!logprobs?.length) return 0;

  let sum = 0;
  for (const token of logprobs) {
    const logprob = token?.logprob;
    if (typeof logprob !== "number" || !Number.isFinite(logprob) || logprob > 0) return 0;
    sum += logprob;
  }

  const confidence = Math.exp(sum / logprobs.length);
  if (!Number.isFinite(confidence)) return 0;
  return Math.min(1, Math.max(0, confidence));
}
