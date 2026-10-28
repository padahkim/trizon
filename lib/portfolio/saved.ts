import { z } from "zod";
import { holdingSchema } from "./types";

// The full v1 shape is shared by every importer, including the future trade importer.
const usTradeSchema = z.object({
  key: z.string(), tradeDate: z.iso.date(), ticker: z.string(), name: z.string(),
  side: z.enum(["buy", "sell"]), account: z.string(),
  quantity: z.number().finite().positive(), price: z.number().finite().nonnegative(),
  settlement: z.object({ amount: z.number().finite(), currency: z.enum(["JPY", "USD"]) }).optional(),
});
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
