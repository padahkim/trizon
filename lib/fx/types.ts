import { z } from "zod";

export const usdJpyRateSchema = z.object({
  yenPerDollar: z.number().finite().positive(),
  asOf: z.iso.datetime(),
});
export type UsdJpyRate = z.infer<typeof usdJpyRateSchema>;

export function currentUsdJpyRate(value: unknown, now = new Date()): UsdJpyRate | undefined {
  const parsed = usdJpyRateSchema.safeParse(value);
  return parsed.success && Date.parse(parsed.data.asOf) >= now.getTime() - 7 * 86_400_000 ? parsed.data : undefined;
}
