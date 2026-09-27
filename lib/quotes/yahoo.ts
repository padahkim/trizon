import YahooFinance from "yahoo-finance2";
import { makeRates } from "../portfolio/fx.ts";
import type { FxProvider, FxQuote, Quote, QuoteProvider } from "./types.ts";

// Yahoo Finance 비공식 API (yahoo-finance2 v4). Node runtime 전용.
// 가끔 429·crumb 오류로 깨진다 — 호출은 service.ts 가 묶고 캐시·폴백한다.

export const FX_SYMBOLS = { KRW: "KRW=X", JPY: "JPY=X" } as const;

type YahooQuote = {
  symbol: string;
  currency?: string;
  regularMarketPrice?: number;
  regularMarketTime?: Date | number | string;
  shortName?: string;
  longName?: string;
};

export function createYahooProvider(): QuoteProvider & FxProvider {
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"], versionCheck: false });

  async function fetchQuotes(symbols: string[]): Promise<Record<string, Quote>> {
    if (symbols.length === 0) return {};
    const rows = (await yf.quote(
      symbols,
      { return: "array", fields: ["symbol", "currency", "regularMarketPrice", "regularMarketTime", "shortName", "longName"] },
      { validateResult: false },
    )) as unknown as YahooQuote[];

    const out: Record<string, Quote> = {};
    for (const row of rows) {
      const price = row.regularMarketPrice;
      if (typeof price !== "number" || !(price > 0) || !row.currency) continue;
      out[row.symbol] = {
        symbol: row.symbol,
        price,
        currency: row.currency,
        marketTime: toIso(row.regularMarketTime),
        name: row.longName ?? row.shortName,
      };
    }
    return out;
  }

  return {
    name: "yahoo",
    fetchQuotes,
    async fetchFx(): Promise<FxQuote> {
      const q = await fetchQuotes([FX_SYMBOLS.KRW, FX_SYMBOLS.JPY]);
      return fxFromQuotes(q);
    },
  };
}

/** KRW=X · JPY=X 시세 → FxQuote. 하나라도 없으면 throw */
export function fxFromQuotes(quotes: Record<string, Quote>): FxQuote {
  const krw = quotes[FX_SYMBOLS.KRW];
  const jpy = quotes[FX_SYMBOLS.JPY];
  if (!krw || !jpy) throw new Error("Yahoo 환율(KRW=X, JPY=X)을 받지 못했습니다");
  return {
    rates: makeRates(krw.price, jpy.price),
    asOf: krw.marketTime < jpy.marketTime ? krw.marketTime : jpy.marketTime,
    source: "Yahoo Finance",
  };
}

function toIso(t: Date | number | string | undefined): string {
  if (t === undefined) return "";
  const d = t instanceof Date ? t : typeof t === "number" ? new Date(t < 1e12 ? t * 1000 : t) : new Date(t);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
