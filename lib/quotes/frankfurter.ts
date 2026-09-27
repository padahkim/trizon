import { makeRates } from "../portfolio/fx.ts";
import type { FxProvider, FxQuote } from "./types.ts";

// 환율 폴백: Frankfurter (ECB 기준 환율, 영업일 하루 1회 갱신, 키 불필요)
const URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW,JPY";

export function createFrankfurterProvider(fetchImpl: typeof fetch = fetch): FxProvider {
  return {
    name: "frankfurter",
    async fetchFx(): Promise<FxQuote> {
      const res = await fetchImpl(URL, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
      const body = (await res.json()) as { date?: string; rates?: { KRW?: number; JPY?: number } };
      if (!body.rates?.KRW || !body.rates?.JPY) throw new Error("Frankfurter 응답에 KRW/JPY 가 없습니다");
      return {
        rates: makeRates(body.rates.KRW, body.rates.JPY),
        asOf: body.date ? new Date(`${body.date}T16:00:00+02:00`).toISOString() : new Date().toISOString(),
        source: "Frankfurter (ECB)",
      };
    },
  };
}
