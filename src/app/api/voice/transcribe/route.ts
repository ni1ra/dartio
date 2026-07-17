import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getVoiceEnv } from "@/lib/env/server";
import { parseVoiceCommand } from "@/lib/voice/commands";
import { requireCurrentUser } from "@/lib/server/auth";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await requireCurrentUser();
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Audio must be a file up to 10 MB" }, { status: 400 });
    const result = await new OpenAI({ apiKey: getVoiceEnv().OPENAI_API_KEY }).audio.transcriptions.create({ file: audio, model: "gpt-4o-mini-transcribe", language: form.get("language")?.toString() || undefined });
    return NextResponse.json({ transcript: result.text, command: parseVoiceCommand(result.text) });
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number(error.status) : 500;
    return NextResponse.json({ error: status === 500 ? "Transcription failed" : "Authentication required" }, { status });
  }
}
