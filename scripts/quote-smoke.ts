// 실제 시세 조회 확인용 (npm test 에는 넣지 않는다 — 네트워크에 의존한다).
// 사용법: npm run quote:smoke -- 005930 7203 285A AAPL BRK.B
//   시장은 코드 형식으로 추정한다: 6자리 → KR, 4자리 → JP, 그 외 → US

import { quoteSymbolCandidates } from "../lib/domain/symbols.ts";
import type { Market } from "../lib/domain/model.ts";
import { createFrankfurterProvider } from "../lib/quotes/frankfurter.ts";
import { createYahooProvider, FX_SYMBOLS } from "../lib/quotes/yahoo.ts";

const codes = process.argv.slice(2);
if (codes.length === 0) codes.push("005930", "7203", "285A", "AAPL", "BRK.B");

const guessMarket = (code: string): Market =>
  /^A?[0-9][0-9A-Z]{5}$/i.test(code) ? "KR" : /^\d[0-9A-Z]{3}$/i.test(code) ? "JP" : "US";

const candidates = codes.flatMap((code) => {
  const r = quoteSymbolCandidates(guessMarket(code), code);
  if (!r.ok) {
    console.log(`✗ ${code}: ${r.error}`);
    return [];
  }
  return r.candidates;
});

const yahoo = createYahooProvider();
const started = Date.now();
try {
  const quotes = await yahoo.fetchQuotes([...candidates, FX_SYMBOLS.KRW, FX_SYMBOLS.JPY]);
  console.log(`Yahoo: ${Object.keys(quotes).length}개 수신 (${Date.now() - started}ms)`);
  for (const symbol of [...candidates, FX_SYMBOLS.KRW, FX_SYMBOLS.JPY]) {
    const q = quotes[symbol];
    console.log(q ? `  ✓ ${symbol.padEnd(10)} ${String(q.price).padStart(12)} ${q.currency}  ${q.marketTime}  ${q.name ?? ""}` : `  · ${symbol} (없음)`);
  }
} catch (err) {
  console.log(`✗ Yahoo 실패: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}

try {
  const fx = await createFrankfurterProvider().fetchFx();
  console.log(`Frankfurter: USD/KRW ${fx.rates.KRW}, USD/JPY ${fx.rates.JPY} (as of ${fx.asOf})`);
} catch (err) {
  console.log(`✗ Frankfurter 실패: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
