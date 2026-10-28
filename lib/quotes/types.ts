import { z } from "zod";
import { currencySchema, type Market } from "../portfolio/types";

export type QuoteKey = `${Market}:${string}`;
// Only the two markets supported in phase 1 can reach the provider.
export const quoteKeySchema = z.custom<QuoteKey>((value) =>
  typeof value === "string" && /^(JP:[A-Z0-9]{4}|US:[A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)*)$/.test(value),
);
export const quoteSchema = z.object({
  price: z.number().finite().nonnegative(),
  previousClose: z.number().finite().nonnegative().optional(),
  currency: currencySchema,
  marketTime: z.iso.datetime(),
});
export type Quote = z.infer<typeof quoteSchema>;
export type Quotes = Partial<Record<QuoteKey, Quote>>;
export interface QuoteProvider {
  readonly name: string;
  /** Missing symbols are omitted; network and server failures throw. */
  fetchQuotes(keys: QuoteKey[]): Promise<Quotes>;
}
