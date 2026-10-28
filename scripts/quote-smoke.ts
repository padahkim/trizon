import { createYahooProvider } from "../lib/quotes/yahoo";
import type { QuoteKey } from "../lib/quotes/types";

const keys: QuoteKey[] = ["JP:7203", "JP:130A", "US:AAPL", "US:BRK.B"];
try {
  const quotes = await createYahooProvider().fetchQuotes(keys);
  for (const key of keys) {
    const quote = quotes[key];
    if (!quote) throw new Error(`No quote returned for ${key}`);
    console.log(`${key}: ${quote.price} ${quote.currency}, previous close ${quote.previousClose ?? "missing"}, ${quote.marketTime}`);
  }
} catch (error) {
  console.error("Yahoo quote smoke check failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
