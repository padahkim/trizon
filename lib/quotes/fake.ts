import type { QuoteProvider, Quotes } from "./types";

/** PRD fixtures: 1111 = JP-A, 999A = JP-B, ZZA = US-A, ZZB = US-B. */
export function createFakeProvider(now = () => new Date()): QuoteProvider {
  return {
    name: "fake",
    async fetchQuotes(keys) {
      const date = now();
      const marketTime = (hour: number) => {
        const close = new Date(date);
        close.setUTCHours(hour, 0, 0, 0);
        if (close > date) close.setUTCDate(close.getUTCDate() - 1);
        return close.toISOString();
      };
      const fixtures: Quotes = {
        "JP:1111": { price: 1200, previousClose: 1150, currency: "JPY", marketTime: marketTime(6) },
        "JP:999A": { price: 800, previousClose: 820, currency: "JPY", marketTime: marketTime(6) },
        "US:ZZA": { price: 45.5, previousClose: 46, currency: "USD", marketTime: marketTime(20) },
        "US:ZZB": { price: 25, previousClose: 24.5, currency: "USD", marketTime: marketTime(20) },
      };
      const quotes: Quotes = {};
      for (const key of keys) if (fixtures[key]) quotes[key] = fixtures[key];
      return quotes;
    },
  };
}
