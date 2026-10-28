import { z } from "zod";
import { holdingSchema } from "./types";
import { usTradeSchema } from "../sbi/us-trades";

export const savedV1Schema = z.object({
  version: z.literal(1),
  sbiPortfolio: z.object({ uploadedAt: z.iso.datetime(), holdings: z.array(holdingSchema), notices: z.array(z.string()) }).optional(),
  sbiUsTrades: z.object({ uploadedAt: z.iso.datetime(), trades: z.array(usTradeSchema) }).optional(),
});
export type SavedV1 = z.infer<typeof savedV1Schema>;
export type LoadResult = { status: "empty" } | { status: "ok"; saved: SavedV1 } | { status: "unreadable" };

export function loadSaved(raw: string | null): LoadResult {
  if (raw === null) return { status: "empty" };
  try {
    const parsed = savedV1Schema.safeParse(JSON.parse(raw));
    return parsed.success ? { status: "ok", saved: parsed.data } : { status: "unreadable" };
  } catch {
    return { status: "unreadable" };
  }
}

export function serializeSaved(saved: SavedV1): string {
  return JSON.stringify(savedV1Schema.parse(saved));
}
