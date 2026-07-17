import { z } from "zod";

const legalSegmentSchema = z.number().int().refine((value) => value === 0 || (value >= 1 && value <= 20) || value === 25, "Illegal dart segment");
export const voiceCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("dart"), segment: legalSegmentSchema, multiplier: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).refine((value) => value.segment !== 0 || value.multiplier === 1).refine((value) => value.segment !== 25 || value.multiplier !== 3),
  z.object({ type: z.literal("turn_score"), score: z.number().int().min(0).max(180) }),
  z.object({ type: z.literal("undo") }),
  z.object({ type: z.literal("next_player") }),
  z.object({ type: z.literal("confirm") }),
  z.object({ type: z.literal("cancel") }),
]);
export type VoiceCommand = z.infer<typeof voiceCommandSchema>;

const NUMBERS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, bull: 25 };

export function parseVoiceCommand(input: string): VoiceCommand | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^(undo|take that back|correct)$/.test(text)) return { type: "undo" };
  if (/^(confirm|yes|accept)$/.test(text)) return { type: "confirm" };
  if (/^(cancel|no|reject)$/.test(text)) return { type: "cancel" };
  if (/^(next|next player)$/.test(text)) return { type: "next_player" };
  const turn = text.match(/^(?:score|turn|i scored)\s+(.+)$/);
  if (turn) { const score = parseNumber(turn[1]!); return score !== null && score <= 180 ? { type: "turn_score", score } : null; }
  const hit = text.match(/^(single|double|treble|triple)?\s*(.+)$/);
  if (!hit) return null;
  const segment = parseNumber(hit[2]!);
  const multiplier: 1 | 2 | 3 = hit[1] === "double" ? 2 : hit[1] === "treble" || hit[1] === "triple" ? 3 : 1;
  const command = { type: "dart" as const, segment: segment ?? -1, multiplier };
  return voiceCommandSchema.safeParse(command).success ? command : null;
}

function parseNumber(value: string): number | null {
  if (/^\d{1,3}$/.test(value)) return Number(value);
  const normalized = value.replace(/-/g, " ").split(" ").filter((word) => word !== "and");
  let total = 0; let current = 0;
  for (const word of normalized) {
    if (word === "hundred") { current = Math.max(current, 1) * 100; continue; }
    const amount = NUMBERS[word]; if (amount === undefined) return null; current += amount;
  }
  total += current;
  return normalized.length ? total : null;
}
