import type { Currency } from "../domain/model.ts";
import { isQuoteStale } from "../portfolio/calc.ts";
import type { Quote } from "./types.ts";

export type ResolveResult = { ok: true; quote: Quote } | { ok: false; error: string };

/**
 * 후보 심볼 중 실제로 거래되는 것을 고른다.
 * "먼저 응답한 후보"를 쓰면 안 된다: Yahoo 는 없는 조합에도 옛 시세를 돌려준다
 * (2026-09 관측: 247540.KS 가 2024-07-19 시세를 반환 — 실제로는 KOSDAQ 247540.KQ).
 * 그래서 통화가 맞는 후보 중 시세 시각이 가장 최근인 것을 고르고, 그것마저 오래됐으면 거부한다.
 */
export function pickBestQuote(
  candidates: readonly string[],
  quotes: Readonly<Record<string, Quote>>,
  expectedCurrency: Currency,
  now: Date,
): ResolveResult {
  const found = candidates.map((s) => quotes[s]).filter((q): q is Quote => q !== undefined);
  if (found.length === 0) return { ok: false, error: "종목을 찾을 수 없습니다. 코드와 시장을 확인하세요" };

  const matching = found.filter((q) => q.currency === expectedCurrency);
  if (matching.length === 0) {
    return { ok: false, error: `시세 통화가 ${found[0].currency} 입니다 (예상: ${expectedCurrency}). 시장 선택을 확인하세요` };
  }

  const best = matching.reduce((a, b) => (Date.parse(b.marketTime) > Date.parse(a.marketTime) ? b : a));
  if (isQuoteStale(best, now)) {
    const date = best.marketTime ? best.marketTime.slice(0, 10) : "알 수 없음";
    return { ok: false, error: `최근 시세가 없습니다 (마지막 ${date}). 상장폐지·거래정지이거나 코드가 틀렸을 수 있습니다` };
  }
  return { ok: true, quote: best };
}
