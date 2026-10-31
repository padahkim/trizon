import YahooFinance from "yahoo-finance2";
import { currentUsdJpyRate, type UsdJpyRate } from "./types";

export async function fetchUsdJpyRate(): Promise<UsdJpyRate> {
  const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"], versionCheck: false });
  const row = await yahoo.quote("JPY=X", {
    fields: ["symbol", "currency", "regularMarketPrice", "regularMarketTime"],
  }, { fetchOptions: { signal: AbortSignal.timeout(10_000) } });
  const rate = row.symbol === "JPY=X" && row.currency === "JPY" ? currentUsdJpyRate({
    yenPerDollar: row.regularMarketPrice, asOf: row.regularMarketTime?.toISOString(),
  }) : undefined;
  if (!rate) throw new Error("USD/JPY rate unavailable");
  return rate;
}
