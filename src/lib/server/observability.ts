/**
 * What Dartio says about itself when something happens.
 *
 * There is no third-party agent here on purpose. Vercel captures stdout, so a
 * single line of JSON per event is real observability that costs no dependency, no
 * key, and no request to somebody else's servers on a player's behalf. If a drain
 * is added later it reads these unchanged.
 *
 * Two rules hold everywhere:
 *
 *   1. **Never log identity or unbounded input.** No user id, email, token, cookie,
 *      room code, transcript, match payload, error name, or error message belongs
 *      here. Failures are reduced to one fixed diagnostic category.
 *   2. **A log line is not a feature.** These name things that already happen; they
 *      do not decide anything, and removing every call would change no behaviour.
 */

export type Severity = "info" | "warn" | "error";
export type FailureCategory = "abort" | "syntax" | "type" | "error" | "unknown";

export interface EventFields {
  readonly mode?: string;
  readonly route?: string;
  readonly status?: number;
  readonly durationMs?: number;
  readonly count?: number;
  readonly failure?: FailureCategory;
}

interface Emitted extends EventFields {
  readonly event: string;
  readonly severity: Severity;
  readonly at: string;
}

type Sink = (line: Emitted) => void;

const defaultSink: Sink = (line) => {
  const serialized = JSON.stringify(line);
  if (line.severity === "error") console.error(serialized);
  else if (line.severity === "warn") console.warn(serialized);
  else console.info(serialized);
};

let sink: Sink = defaultSink;

/** Swapped in tests so an assertion can read what would have been logged. */
export function setObservabilitySink(next: Sink | null): void {
  sink = next ?? defaultSink;
}

/**
 * The fields a line may carry, named one at a time.
 *
 * Spreading the caller's object would put whatever it happened to hold into the
 * log — the types forbid an email or a token, but types are not a runtime
 * guarantee, and "never log a secret" has to hold when somebody reaches past them.
 * An allow-list is the only version of that rule that is actually enforced.
 */
const FIELDS = ["mode", "route", "status", "durationMs", "count", "failure"] as const;

export function record(event: string, fields: EventFields = {}, severity: Severity = "info"): void {
  const line: Emitted = { event, severity, at: new Date().toISOString() };
  for (const field of FIELDS) {
    const value = fields[field];
    if (value !== undefined) Object.assign(line, { [field]: value });
  }
  sink(line);
}

/**
 * Records a failure without letting its cause escape into logs or a response.
 *
 * Error names and messages can contain provider responses, identifiers, malformed
 * payload fragments, or credentials. A small category keeps failures searchable
 * while making that entire class of accidental disclosure impossible.
 */
export function recordFailure(event: string, cause: unknown, fields: EventFields = {}): void {
  const failure: FailureCategory = cause instanceof Error && cause.name === "AbortError"
    ? "abort"
    : cause instanceof SyntaxError
      ? "syntax"
      : cause instanceof TypeError
        ? "type"
        : cause instanceof Error
          ? "error"
          : "unknown";
  record(event, { ...fields, failure }, "error");
}
