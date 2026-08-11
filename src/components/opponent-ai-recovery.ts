import { AiThrowClientError } from "@/lib/product/ai-throw-client";

export interface AiRecovery {
  readonly kind: "denied" | "unavailable";
  readonly message: string;
  readonly announcement: string;
}

/** Maps server and transport failures to one fail-closed recovery vocabulary. */
export function describeAiFailure(problem: unknown): AiRecovery {
  if (
    problem instanceof AiThrowClientError
    && (problem.status === 401 || problem.status === 403)
  ) {
    return {
      kind: "denied",
      message: "Pro access could not authorize this AI visit.",
      announcement: "AI visit paused · Pro authorization required",
    };
  }
  return {
    kind: "unavailable",
    message: problem instanceof AiThrowClientError
      && problem.code === "access_status_unavailable"
      ? "Pro verification is temporarily unavailable."
      : "The premium AI visit could not reach Dartio.",
    announcement: "AI visit paused · no score changed",
  };
}

/** Keeps an explicit premium retry paused unless refreshed authority agrees. */
export function describeAiRefresh(
  result: "ready" | "required" | "unavailable",
): AiRecovery | null {
  if (result === "ready") return null;
  return result === "required"
    ? {
        kind: "denied",
        message: "Pro access could not authorize this AI visit.",
        announcement: "AI visit paused · Pro authorization required",
      }
    : {
        kind: "unavailable",
        message: "Pro verification is temporarily unavailable.",
        announcement: "AI visit paused · no score changed",
      };
}
