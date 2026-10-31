import { z } from "zod";

export const brokerSchema = z.enum(["SBI", "KB", "NH", "TOSS"]);
export const marketSchema = z.enum(["JP", "US", "KR"]);
export const currencySchema = z.enum(["JPY", "USD", "KRW"]);
export const holdingSchema = z.object({
  broker: brokerSchema,
  account: z.string(),
  market: marketSchema,
  assetType: z.enum(["stock", "fund"]).optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().finite().nonnegative(),
  avgCost: z.number().finite().nonnegative(),
  csvQuote: z.object({ price: z.number().finite().nonnegative(), asOf: z.iso.datetime() }).optional(),
  csvValuation: z.object({
    value: z.number().finite().nonnegative().optional(),
    pnl: z.number().finite().optional(),
    dayChange: z.number().finite().optional(),
  }).optional(),
});
export type Broker = z.infer<typeof brokerSchema>;
export type Market = z.infer<typeof marketSchema>;
export type Currency = z.infer<typeof currencySchema>;
export type Holding = z.infer<typeof holdingSchema>;
export const brokerCountry = { SBI: "JP", KB: "KR", NH: "KR", TOSS: "KR" } as const;
export const marketCurrency: Record<Market, Currency> = { JP: "JPY", US: "USD", KR: "KRW" };
