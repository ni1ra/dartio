import { beforeEach, describe, expect, it, vi } from "vitest";

const { openAiCreate } = vi.hoisted(() => ({ openAiCreate: vi.fn() }));

vi.mock("@/lib/server/auth", () => ({ requireCurrentUser: vi.fn() }));
vi.mock("@/lib/env/server", () => ({ getVoiceEnv: () => ({ OPENAI_API_KEY: "test-key" }) }));
vi.mock("openai", () => ({
  default: class OpenAI {
    readonly audio = { transcriptions: { create: openAiCreate } };
  },
}));
vi.mock("@/lib/server/entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/entitlements")>();
  return { ...actual, requireEntitlement: vi.fn(async () => undefined) };
});

import { AccessServiceError } from "@/lib/server/access";
import { EntitlementRequiredError } from "@/lib/server/entitlements";
import { AuthError, AuthServiceError } from "@/lib/server/identity";
import { handleVoiceTranscription, POST } from "./route";

const successfulTranscription = { transcript: "score sixty", confidence: 0.82 } as const;

function voiceRequest(
  audio: File | null = new File(["audio"], "voice.webm", { type: "audio/webm" }),
  language: FormDataEntryValue | null = "en",
  signal?: AbortSignal,
): Request {
  const form = new FormData();
  if (audio) form.set("audio", audio);
  if (language !== null) form.set("language", language);
  return new Request("http://localhost/api/voice/transcribe", { method: "POST", body: form, signal });
}

describe("POST /api/voice/transcribe", () => {
  beforeEach(() => {
    openAiCreate.mockReset();
  });

  it("requests JSON token logprobs from the configured transcription model", async () => {
    openAiCreate.mockResolvedValue({
      text: "score sixty",
      logprobs: [{ token: "score", logprob: Math.log(0.81) }],
    });
    const request = voiceRequest();
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(openAiCreate).toHaveBeenCalledWith({
      file: expect.any(File),
      model: "gpt-4o-mini-transcribe",
      language: "en",
      response_format: "json",
      include: ["logprobs"],
    }, { signal: request.signal });
    await expect(response.json()).resolves.toEqual({
      transcript: "score sixty",
      command: { type: "turn_score", score: 60 },
      confidence: 0.81,
    });
  });

  it.each([
    { label: "missing", logprobs: undefined },
    { label: "empty", logprobs: [] },
    { label: "non-number", logprobs: [{ logprob: "high" }] },
    { label: "NaN", logprobs: [{ logprob: Number.NaN }] },
    { label: "positive", logprobs: [{ logprob: 0.01 }] },
  ])("fails closed when provider logprobs are $label", async ({ logprobs }) => {
    openAiCreate.mockResolvedValue({ text: "score sixty", logprobs });
    const response = await POST(voiceRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      transcript: "score sixty",
      command: { type: "turn_score", score: 60 },
      confidence: 0,
    });
  });

  it.each([
    [new AuthError(), 401, { error: "authentication_required" }],
    [new EntitlementRequiredError("voice_always_on"), 402, { error: "upgrade_required", required: "voice_always_on" }],
    [new AuthServiceError(), 503, { error: "access_status_unavailable" }],
    [new AccessServiceError(), 503, { error: "access_status_unavailable" }],
  ] as const)("rejects authority failure with %s without invoking transcription", async (failure, status, body) => {
    const transcribe = vi.fn(async () => successfulTranscription);
    const formData = vi.fn();
    const request = { formData, signal: new AbortController().signal } as unknown as Request;
    const response = await handleVoiceTranscription(request, { authorize: async () => { throw failure; }, transcribe });
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(body);
    expect(formData).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("validates audio only after successful authorization", async () => {
    const transcribe = vi.fn(async () => successfulTranscription);
    const response = await handleVoiceTranscription(voiceRequest(null), { authorize: async () => undefined, transcribe });
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "Audio must be a supported file up to 10 MB" });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("returns a private 400 for malformed multipart data", async () => {
    const transcribe = vi.fn(async () => successfulTranscription);
    const request = {
      formData: async () => { throw new TypeError("malformed multipart boundary"); },
      signal: new AbortController().signal,
    } as unknown as Request;
    const response = await handleVoiceTranscription(request, { authorize: async () => undefined, transcribe });

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "Invalid audio request" });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it.each([
    { label: "empty", makeAudio: () => new File([], "voice.webm", { type: "audio/webm" }) },
    {
      label: "larger than 10 MB",
      makeAudio: () => new File([new Uint8Array(10 * 1024 * 1024 + 1)], "voice.webm", { type: "audio/webm" }),
    },
  ])("rejects $label audio before invoking the provider", async ({ makeAudio }) => {
    const transcribe = vi.fn(async () => successfulTranscription);
    const response = await handleVoiceTranscription(voiceRequest(makeAudio()), {
      authorize: async () => undefined,
      transcribe,
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "Audio must be a supported file up to 10 MB" });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("transcribes entitled audio and returns the exact confidence-bearing contract", async () => {
    const transcribe = vi.fn(async () => ({ transcript: "  score sixty  ", confidence: 0.82 }));
    const request = voiceRequest();
    const response = await handleVoiceTranscription(request, { authorize: async () => undefined, transcribe });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(transcribe).toHaveBeenCalledWith(expect.any(File), { language: "en", signal: request.signal });
    await expect(response.json()).resolves.toEqual({
      transcript: "score sixty",
      command: { type: "turn_score", score: 60 },
      confidence: 0.82,
    });
  });

  it("returns zero confidence for an empty transcript", async () => {
    const response = await handleVoiceTranscription(voiceRequest(), {
      authorize: async () => undefined,
      transcribe: async () => ({ transcript: "   ", confidence: 1 }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ transcript: "", command: null, confidence: 0 });
  });

  it.each([
    {
      label: "unsupported audio",
      audio: new File(["audio"], "voice.txt", { type: "text/plain" }),
      language: "en",
      error: "Audio must be a supported file up to 10 MB",
    },
    {
      label: "invalid language",
      audio: new File(["audio"], "voice.webm", { type: "audio/webm" }),
      language: "EN",
      error: "Language must be an ISO 639-1 code",
    },
    {
      label: "file language",
      audio: new File(["audio"], "voice.webm", { type: "audio/webm" }),
      language: new File(["en"], "language.txt"),
      error: "Language must be an ISO 639-1 code",
    },
  ] as const)("rejects $label", async ({ audio, language, error }) => {
    const transcribe = vi.fn(async () => successfulTranscription);
    const response = await handleVoiceTranscription(voiceRequest(audio, language), {
      authorize: async () => undefined,
      transcribe,
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("passes an absent optional language through as undefined", async () => {
    const transcribe = vi.fn(async () => successfulTranscription);
    const request = voiceRequest(undefined, null);
    const response = await handleVoiceTranscription(request, { authorize: async () => undefined, transcribe });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(transcribe).toHaveBeenCalledWith(expect.any(File), { language: undefined, signal: request.signal });
  });

  it("stops before parsing or transcription when the client has already disconnected", async () => {
    const controller = new AbortController();
    const request = voiceRequest(undefined, "en", controller.signal);
    controller.abort();
    const formData = vi.spyOn(request, "formData");
    const transcribe = vi.fn(async () => successfulTranscription);
    const response = await handleVoiceTranscription(request, { authorize: async () => undefined, transcribe });

    expect(response.status).toBe(499);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "request_cancelled" });
    expect(formData).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("maps a provider abort to a private cancellation response", async () => {
    const request = voiceRequest();
    const transcribe = vi.fn(async (_audio: File, options: { signal: AbortSignal }) => {
      expect(options.signal).toBe(request.signal);
      throw new DOMException("cancelled", "AbortError");
    });
    const response = await handleVoiceTranscription(request, { authorize: async () => undefined, transcribe });

    expect(response.status).toBe(499);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "request_cancelled" });
  });

  it("sanitizes transcription provider failures", async () => {
    const response = await handleVoiceTranscription(voiceRequest(), { authorize: async () => undefined, transcribe: async () => { throw new Error("sk-secret provider detail"); } });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "Transcription failed" });
  });

  it.each([
    { transcript: "score sixty", confidence: Number.NaN },
    { transcript: "score sixty", confidence: 1.01 },
    { transcript: "score sixty", confidence: -0.01 },
  ])("sanitizes malformed provider output: $confidence", async (result) => {
    const response = await handleVoiceTranscription(voiceRequest(), {
      authorize: async () => undefined,
      transcribe: async () => result,
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "Transcription failed" });
  });
});
