import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ requireCurrentUser: vi.fn() }));

import { AccessServiceError } from "@/lib/server/access";
import { EntitlementRequiredError } from "@/lib/server/entitlements";
import { AuthError, AuthServiceError } from "@/lib/server/identity";
import { handleVoiceTranscription } from "./route";

function voiceRequest(audio: File | null = new File(["audio"], "voice.webm", { type: "audio/webm" })): Request {
  const form = new FormData();
  if (audio) form.set("audio", audio);
  form.set("language", "en");
  return new Request("http://localhost/api/voice/transcribe", { method: "POST", body: form });
}

describe("POST /api/voice/transcribe", () => {
  it.each([
    [new AuthError(), 401, { error: "authentication_required" }],
    [new EntitlementRequiredError("voice_always_on"), 402, { error: "upgrade_required", required: "voice_always_on" }],
    [new AuthServiceError(), 503, { error: "access_status_unavailable" }],
    [new AccessServiceError(), 503, { error: "access_status_unavailable" }],
  ] as const)("rejects authority failure with %s without invoking transcription", async (failure, status, body) => {
    const transcribe = vi.fn(async () => "score sixty");
    const formData = vi.fn();
    const request = { formData } as unknown as Request;
    const response = await handleVoiceTranscription(request, { authorize: async () => { throw failure; }, transcribe });
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(body);
    expect(formData).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("validates audio only after successful authorization", async () => {
    const transcribe = vi.fn(async () => "score sixty");
    const response = await handleVoiceTranscription(voiceRequest(null), { authorize: async () => undefined, transcribe });
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("transcribes entitled audio and returns the parsed command", async () => {
    const transcribe = vi.fn(async () => "score sixty");
    const response = await handleVoiceTranscription(voiceRequest(), { authorize: async () => undefined, transcribe });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(transcribe).toHaveBeenCalledWith(expect.any(File), "en");
    await expect(response.json()).resolves.toMatchObject({ transcript: "score sixty", command: { type: "turn_score", score: 60 } });
  });

  it("sanitizes transcription provider failures", async () => {
    const response = await handleVoiceTranscription(voiceRequest(), { authorize: async () => undefined, transcribe: async () => { throw new Error("sk-secret provider detail"); } });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "Transcription failed" });
  });
});
