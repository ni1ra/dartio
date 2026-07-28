import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getVoiceEnv } from "@/lib/env/server";
import { parseVoiceCommand } from "@/lib/voice/commands";
import { requireEntitlement, safeEntitlementError } from "@/lib/server/entitlements";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" } as const;

interface VoiceDependencies {
  readonly authorize: () => Promise<unknown>;
  readonly transcribe: (audio: File, language?: string) => Promise<string>;
}

const productionDependencies: VoiceDependencies = {
  authorize: () => requireEntitlement("voice_always_on"),
  async transcribe(audio, language) {
    const result = await new OpenAI({ apiKey: getVoiceEnv().OPENAI_API_KEY }).audio.transcriptions.create({ file: audio, model: "gpt-4o-mini-transcribe", language });
    return result.text;
  },
};

export async function handleVoiceTranscription(request: Request, dependencies: VoiceDependencies = productionDependencies): Promise<Response> {
  try {
    await dependencies.authorize();
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid audio request" }, { status: 400, headers: PRIVATE_HEADERS });
    }
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Audio must be a file up to 10 MB" }, { status: 400, headers: PRIVATE_HEADERS });
    const transcript = await dependencies.transcribe(audio, form.get("language")?.toString() || undefined);
    return NextResponse.json({ transcript, command: parseVoiceCommand(transcript) }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    const failure = safeEntitlementError(error, "Transcription failed");
    return NextResponse.json(failure.body, { status: failure.status, headers: PRIVATE_HEADERS });
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleVoiceTranscription(request);
}
