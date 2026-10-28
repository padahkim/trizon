import YahooFinance from "yahoo-finance2";
import { quoteSchema, type QuoteKey, type QuoteProvider, type Quotes } from "./types";

export function toYahooSymbol(key: QuoteKey): string {
  const [market, code] = key.split(":");
  if (market === "JP") return `${code}.T`;
  if (market === "US") return code.replaceAll(".", "-");
  throw new Error("Unsupported quote market");
}

export function createYahooProvider(): QuoteProvider {
  const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"], versionCheck: false });
  return {
    name: "yahoo",
    async fetchQuotes(keys) {
      if (!keys.length) return {};
      const symbols = new Map(keys.map((key) => [toYahooSymbol(key), key]));
      const rows = await yahoo.quote([...symbols.keys()], {
        return: "array",
        fields: ["symbol", "currency", "regularMarketPrice", "regularMarketPreviousClose", "regularMarketTime"],
      }, { fetchOptions: { signal: AbortSignal.timeout(10_000) } });
      const quotes: Quotes = {};
      for (const row of rows) {
        const key = symbols.get(row.symbol);
        const parsed = quoteSchema.safeParse({
          price: row.regularMarketPrice,
          previousClose: row.regularMarketPreviousClose,
          currency: row.currency,
          marketTime: row.regularMarketTime?.toISOString(),
        });
        if (key && parsed.success) quotes[key] = parsed.data;
      }
      return quotes;
    },
  };
}
