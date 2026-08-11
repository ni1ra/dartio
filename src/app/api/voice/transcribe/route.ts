import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getVoiceEnv } from "@/lib/env/server";
import { parseVoiceCommand } from "@/lib/voice/commands";
import { confidenceFromLogprobs } from "@/lib/voice/confidence";
import { requireEntitlement, safeEntitlementError } from "@/lib/server/entitlements";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" } as const;
const SUPPORTED_AUDIO_EXTENSIONS = new Set(["flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm"]);
const LANGUAGE_CODE = /^[a-z]{2}$/;

interface VoiceTranscription {
  readonly transcript: string;
  readonly confidence: number;
}

interface TranscriptionOptions {
  readonly language?: string;
  readonly signal: AbortSignal;
}

interface VoiceDependencies {
  readonly authorize: () => Promise<unknown>;
  readonly transcribe: (audio: File, options: TranscriptionOptions) => Promise<VoiceTranscription>;
}

const productionDependencies: VoiceDependencies = {
  authorize: () => requireEntitlement("voice_always_on"),
  async transcribe(audio, { language, signal }) {
    const result = await new OpenAI({ apiKey: getVoiceEnv().OPENAI_API_KEY }).audio.transcriptions.create({
      file: audio,
      model: "gpt-4o-mini-transcribe",
      language,
      response_format: "json",
      include: ["logprobs"],
    }, { signal });
    return {
      transcript: result.text,
      confidence: confidenceFromLogprobs(result.logprobs),
    };
  },
};

export async function handleVoiceTranscription(request: Request, dependencies: VoiceDependencies = productionDependencies): Promise<Response> {
  try {
    await dependencies.authorize();
    if (request.signal.aborted) return cancelledResponse();
    let form: FormData;
    try {
      form = await request.formData();
    } catch (error) {
      if (isAbortFailure(error, request.signal)) return cancelledResponse();
      return NextResponse.json({ error: "Invalid audio request" }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const audio = form.get("audio");
    if (!(audio instanceof File) || !isSupportedAudio(audio)) {
      return NextResponse.json({ error: "Audio must be a supported file up to 10 MB" }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const languageEntry = form.get("language");
    if (languageEntry !== null && (typeof languageEntry !== "string" || !LANGUAGE_CODE.test(languageEntry))) {
      return NextResponse.json({ error: "Language must be an ISO 639-1 code" }, { status: 400, headers: PRIVATE_HEADERS });
    }

    const result = await dependencies.transcribe(audio, {
      language: languageEntry ?? undefined,
      signal: request.signal,
    });
    if (!isVoiceTranscription(result)) throw new Error("Invalid transcription provider response");
    const transcript = result.transcript.trim();
    const confidence = transcript ? result.confidence : 0;
    return NextResponse.json({ transcript, command: parseVoiceCommand(transcript), confidence }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (isAbortFailure(error, request.signal)) return cancelledResponse();
    const failure = safeEntitlementError(error, "Transcription failed");
    return NextResponse.json(failure.body, { status: failure.status, headers: PRIVATE_HEADERS });
  }
}

/** The upstream accepts only these extension-bearing audio formats. */
function isSupportedAudio(audio: File): boolean {
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) return false;
  const extension = audio.name.split(".").pop()?.toLowerCase();
  return extension !== undefined && SUPPORTED_AUDIO_EXTENSIONS.has(extension);
}

/** Guards the public response invariant even if a provider response is malformed. */
function isVoiceTranscription(result: unknown): result is VoiceTranscription {
  if (typeof result !== "object" || result === null) return false;
  const candidate = result as Partial<VoiceTranscription>;
  return typeof candidate.transcript === "string"
    && typeof candidate.confidence === "number"
    && Number.isFinite(candidate.confidence)
    && candidate.confidence >= 0
    && candidate.confidence <= 1;
}

function isAbortFailure(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function cancelledResponse(): Response {
  return NextResponse.json({ error: "request_cancelled" }, { status: 499, headers: PRIVATE_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  return handleVoiceTranscription(request);
}
