import { test } from "node:test";
import assert from "node:assert/strict";
import type { Account, Holding } from "../domain/schema.ts";
import type { Quote } from "../quotes/types.ts";
import { buildPortfolioView, businessDaysBetween, evaluateHolding, isQuoteStale } from "./calc.ts";
import { makeRates } from "./fx.ts";

const rates = makeRates(1_350, 150);
const now = new Date("2026-09-25T06:00:00Z"); // 금요일
const fresh = "2026-09-25T05:00:00Z";

const kb: Account = { id: "kb", broker: "KB", label: "KB증권", homeCurrency: "KRW" };
const sbi: Account = { id: "sbi", broker: "SBI", label: "SBI証券", homeCurrency: "JPY" };

const holding = (h: Partial<Holding> & Pick<Holding, "id" | "accountId" | "market" | "quoteSymbol" | "quantity" | "avgCost">): Holding => ({
  code: h.quoteSymbol,
  name: h.quoteSymbol,
  updatedAt: "2026-09-25T00:00:00Z",
  ...h,
});
const quote = (symbol: string, price: number, currency: string, extra: Partial<Quote> = {}): Quote => ({
  symbol,
  price,
  currency,
  marketTime: fresh,
  ...extra,
});

const samsung = holding({ id: "h1", accountId: "kb", market: "KR", quoteSymbol: "005930.KS", quantity: 10, avgCost: 70_000 });
const aaplAtKb = holding({ id: "h2", accountId: "kb", market: "US", quoteSymbol: "AAPL", quantity: 10, avgCost: 150, costBasisHome: 1_950_000 });
const vooAtSbiNoBasis = holding({ id: "h3", accountId: "sbi", market: "US", quoteSymbol: "VOO", quantity: 2, avgCost: 400 });
const rewardShare = holding({ id: "h4", accountId: "sbi", market: "JP", quoteSymbol: "7203.T", quantity: 100, avgCost: 0 });
const unpriced = holding({ id: "h5", accountId: "kb", market: "KR", quoteSymbol: "000660.KS", quantity: 5, avgCost: 100_000 });

const quotes: Record<string, Quote> = {
  "005930.KS": quote("005930.KS", 77_000, "KRW"),
  AAPL: quote("AAPL", 165, "USD"),
  VOO: quote("VOO", 500, "USD"),
  "7203.T": quote("7203.T", 3_000, "JPY"),
};

const close = (actual: number | null, expected: number, eps = 1e-9) => {
  assert.ok(actual !== null && Math.abs(actual - expected) < eps, `expected ${expected}, got ${actual}`);
};

test("국내 종목: 주가 수익률 = 계좌통화 수익률", () => {
  const e = evaluateHolding(samsung, kb, quotes["005930.KS"], rates, now);
  assert.equal(e.valueHome, 770_000);
  assert.equal(e.costHome, 700_000);
  close(e.returnTrade, 0.1);
  close(e.returnHome, 0.1);
  assert.equal(e.priceStatus, "ok");
  assert.equal(e.fxEffectIncluded, true);
});

test("KB 미국 주식: 원화 매입금액으로 환차손익 포함 — 두 수익률이 다르다", () => {
  const e = evaluateHolding(aaplAtKb, kb, quotes.AAPL, rates, now);
  assert.equal(e.valueHome, 1_650 * 1_350);
  assert.equal(e.costHome, 1_950_000);
  close(e.returnTrade, 0.1);
  close(e.returnHome, (2_227_500 - 1_950_000) / 1_950_000);
  assert.equal(e.fxEffectIncluded, true);
});

test("해외 종목인데 매입금액이 없으면 현재 환율로 환산하고 표시가 붙는다", () => {
  const e = evaluateHolding(vooAtSbiNoBasis, sbi, quotes.VOO, rates, now);
  assert.equal(e.costHome, 800 * 150);
  assert.equal(e.fxEffectIncluded, false);
  close(e.returnHome, 0.25);
});

test("평균단가 0 (리워드 주식): 수익률 null, 평가액은 합계에 들어간다", () => {
  const e = evaluateHolding(rewardShare, sbi, quotes["7203.T"], rates, now);
  assert.equal(e.returnTrade, null);
  assert.equal(e.returnHome, null);
  assert.equal(e.valueHome, 300_000);
});

test("시세 없는 종목: 평가액 = 매입액, 손익 0, missing", () => {
  const e = evaluateHolding(unpriced, kb, undefined, rates, now);
  assert.equal(e.priceStatus, "missing");
  assert.equal(e.valueHome, 500_000);
  assert.equal(e.pnlHome, 0);
  assert.equal(e.returnHome, null);
});

test("통화가 어긋난 시세는 쓰지 않는다", () => {
  const e = evaluateHolding(samsung, kb, quote("005930.KS", 55, "USD"), rates, now);
  assert.equal(e.priceStatus, "missing");
  assert.equal(e.valueHome, 700_000);
});

test("stale: 캐시 폴백이거나 5영업일 넘게 지난 시세", () => {
  assert.equal(isQuoteStale(quote("A", 1, "USD", { fromCache: true }), now), true);
  assert.equal(isQuoteStale(quote("A", 1, "USD", { marketTime: "2026-09-18T06:00:00Z" }), now), false); // 딱 5영업일
  assert.equal(isQuoteStale(quote("A", 1, "USD", { marketTime: "2026-09-17T06:00:00Z" }), now), true);
  assert.equal(isQuoteStale(quote("A", 1, "USD", { marketTime: "not a date" }), now), true);
  assert.equal(businessDaysBetween(new Date("2026-09-25T00:00:00Z"), new Date("2026-09-28T00:00:00Z")), 1); // 금→월
});

test("포트폴리오 합계: 표시 통화를 바꿔도 총수익률(%)은 같다", () => {
  const input = {
    accounts: [kb, sbi],
    holdings: [samsung, aaplAtKb, vooAtSbiNoBasis, rewardShare, unpriced],
    quotes,
    rates,
    now,
  };
  const krw = buildPortfolioView({ ...input, displayCurrency: "KRW" });
  const jpy = buildPortfolioView({ ...input, displayCurrency: "JPY" });
  const usd = buildPortfolioView({ ...input, displayCurrency: "USD" });
  close(jpy.total.returnRate, krw.total.returnRate as number);
  close(usd.total.returnRate, krw.total.returnRate as number);
  close(krw.total.value, jpy.total.value * 9, 1e-6); // 1엔 = 9원
  assert.deepEqual(krw.totalIn.USD, usd.total);

  // KB 계좌(원) 합계: 770,000 + 2,227,500 + 500,000
  const kbView = krw.accounts.find((a) => a.account.id === "kb");
  assert.equal(kbView?.home.value, 3_497_500);
  assert.deepEqual(krw.counts, { missing: 1, stale: 0, fxNotIncluded: 1 });

  const weightSum = krw.byMarket.reduce((s, m) => s + m.weight, 0);
  close(weightSum, 1);
});

test("없는 계좌를 참조하면 조용히 빼지 않고 실패한다", () => {
  assert.throws(() =>
    buildPortfolioView({ accounts: [kb], holdings: [rewardShare], quotes, rates, now, displayCurrency: "KRW" }),
  );
});
