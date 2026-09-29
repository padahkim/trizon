import { test } from "node:test";
import assert from "node:assert/strict";
import type { Account, Holding } from "../domain/schema.ts";
import { makeRates } from "../portfolio/fx.ts";
import type { Quote } from "../quotes/types.ts";
import { evaluateMargin, pickSbiAccount, sbiForDashboard, sbiHoldings, sbiUsHoldings, valueSbiHoldings, withFallback } from "./evaluate.ts";
import { PORTFOLIO_CSV } from "./fixtures.ts";
import { parsePortfolio, type LoadedImport, type LoadedUsTrades } from "./parse.ts";
import type { SbiPortfolio, SbiUsHolding } from "./types.ts";

const rates = makeRates(1_350, 150);
const now = new Date("2026-09-28T06:00:00Z");
const asOf = "2026-09-27T15:24:00.000Z";
const sbi: Account = { id: "sbi", broker: "SBI", label: "SBI証券", homeCurrency: "JPY" };
const kb: Account = { id: "kb", broker: "KB", label: "KB증권", homeCurrency: "KRW" };
const live = (symbol: string, price: number): Quote => ({ symbol, price, currency: "JPY", marketTime: "2026-09-28T05:00:00Z" });

function portfolio(): SbiPortfolio {
  const r = parsePortfolio(PORTFOLIO_CSV);
  if (!r.ok) assert.fail(r.error);
  return r.data;
}
const loaded = (): LoadedImport<SbiPortfolio> => ({
  meta: { fileName: "New_file.csv", fileModifiedAt: asOf, importedAt: asOf },
  asOf,
  parsed: { ok: true, data: portfolio(), warnings: [] },
});
const loadedUs = (needsReview: boolean): LoadedUsTrades => ({
  files: [{ fileName: "us-trades.csv", fileModifiedAt: asOf, importedAt: asOf }],
  asOf,
  parsed: {
    ok: true,
    data: { period: null, trades: [], duplicateCount: 0, sourceRowCount: 0, warnings: [] },
    warnings: [],
  },
  holdings: [
    { id: "sbi-us:AAPL:特定", ticker: "AAPL", name: "Apple", quantity: 2, avgCost: 100, costCurrency: "USD", accountType: "特定", source: "inferred" },
  ],
  needsReview,
  confirmedAt: needsReview ? null : asOf,
  closedCount: 0,
});

test("대시보드용은 預り 구분을 합쳐 한 줄로 (평균단가는 가중평균), SBI 화면용은 預り 구분마다", () => {
  const h = sbiHoldings(portfolio(), "sbi", asOf);
  const toyota = h.holdings.find((x) => x.code === "7203");
  assert.equal(toyota?.quoteSymbol, "7203.T");
  assert.equal(toyota?.quantity, 150);
  assert.equal(toyota?.avgCost, (100 * 2_500 + 50 * 2_600) / 150);
  assert.equal(h.holdings.find((x) => x.code === "285A")?.quoteSymbol, "285A.T");

  assert.deepEqual(
    h.lots.map((l) => [l.holding.code, l.accountType, l.holding.quantity, l.holding.avgCost, l.holding.quoteSymbol]),
    [
      ["7203", "特定", 100, 2_500, "7203.T"],
      ["7203", "NISA成長", 50, 2_600, "7203.T"],
      ["285A", "NISA成長", 10, 3_000, "285A.T"],
      ["投資信託", "NISAつみたて", 200_000, 20_000, h.holdings[2].quoteSymbol],
    ],
  );
  assert.equal(new Set(h.lots.map((l) => l.holding.id)).size, h.lots.length);
});

test("투자신탁은 CSV 기준가를 가져온 시세로, 주식은 CSV 현재가를 예비로", () => {
  const h = sbiHoldings(portfolio(), "sbi", asOf);
  const fund = h.holdings.find((x) => x.priceUnit === 10_000);
  assert.ok(fund);
  assert.deepEqual(h.fundQuotes[fund.quoteSymbol], {
    symbol: fund.quoteSymbol,
    price: 25_000,
    currency: "JPY",
    marketTime: asOf,
    name: fund.name,
    imported: true,
  });
  assert.equal(h.csvQuotes["7203.T"]?.price, 2_800);
  assert.equal(h.csvQuotes["6758.T"], undefined); // 신용은 CSV 의 損益을 그대로 쓴다
  assert.equal(h.fundQuotes["7203.T"], undefined);
});

test("시세가 있으면 시세, 없는 것만 CSV 값", () => {
  const merged = withFallback({ "7203.T": live("7203.T", 3_000) }, { "7203.T": live("7203.T", 1), "6758.T": live("6758.T", 2) });
  assert.equal(merged["7203.T"].price, 3_000);
  assert.equal(merged["6758.T"].price, 2);
});

test("신용: CSV 시점의 금리·수수료를 빼고 현재가로 다시 계산한다", () => {
  const [margin] = sbiHoldings(portfolio(), "sbi", asOf).margins;
  // CSV: (3,200 − 3,000) × 100 = 20,000 인데 損益 19,000 → 비용 1,000
  assert.equal(evaluateMargin(margin, live("6758.T", 3_300), now).pnl, 29_000);
  assert.equal(evaluateMargin(margin, live("6758.T", 3_300), now).priceStatus, "ok");
  const sell = { ...margin, position: { ...margin.position, side: "sell" as const, pnl: -21_000 } };
  assert.equal(evaluateMargin(sell, live("6758.T", 3_300), now).pnl, -31_000);
  // 시세가 없거나 CSV 가격뿐이면 CSV 의 損益 그대로 (현물 표의 CSV 가격과 신용 표의 가격이 다를 수 있다)
  for (const q of [undefined, { ...live("6758.T", 3_100), imported: true }]) {
    const e = evaluateMargin(margin, q, now);
    assert.equal(e.priceStatus, "imported");
    assert.equal(e.pnl, 19_000);
    assert.equal(e.price, 3_200);
  }
});

test("CSV 값으로만 평가하면 SBI 総合計와 같다 (평가액에 신용은 넣지 않는다)", () => {
  const h = sbiHoldings(portfolio(), "sbi", asOf);
  const v = valueSbiHoldings(h, sbi, withFallback(h.fundQuotes, h.csvQuotes), rates, now);
  assert.equal(v.value, 947_000);
  assert.equal(v.pnl, 156_000);
  assert.equal(v.cost, 947_000 - 137_000);
  assert.deepEqual(
    v.stocks.map((e) => [e.holding.code, e.accountType, e.valueHome, e.pnlHome]),
    [
      ["7203", "特定", 280_000, 30_000],
      ["7203", "NISA成長", 140_000, 10_000],
      ["285A", "NISA成長", 27_000, -3_000],
    ],
  );
  assert.equal(v.funds.length, 1);
  assert.equal(v.margins.length, 1);
  assert.ok(v.stocks.every((e) => e.priceStatus === "imported"));
});

test("미국주식은 預り 구분별 lot을 유지하고 JPY 취득단가는 엔 총매입액으로 평가한다", () => {
  const rows: SbiUsHolding[] = [
    { id: "a", ticker: "AAPL", name: "Apple", quantity: 1, avgCost: 100, costCurrency: "USD", accountType: "特定", source: "inferred" },
    { id: "b", ticker: "AAPL", name: "Apple", quantity: 2, avgCost: 15_000, costCurrency: "JPY", accountType: "NISA", source: "manual" },
  ];
  const holdings = sbiUsHoldings(rows, sbi, asOf, rates);
  assert.equal(holdings.lots.length, 2);
  assert.deepEqual(holdings.lots.map((lot) => [lot.accountType, lot.holding.quantity, lot.holding.avgCost, lot.holding.costBasisHome]), [
    ["特定", 1, 100, undefined],
    ["NISA", 2, 100, 30_000],
  ]);
  assert.equal(holdings.holdings.length, 1);
  assert.equal(holdings.holdings[0].quantity, 3);
  assert.equal(holdings.holdings[0].costBasisHome, 45_000);

  const quote: Quote = { symbol: "AAPL", price: 120, currency: "USD", marketTime: "2026-09-28T05:00:00Z" };
  const valuation = valueSbiHoldings(holdings, sbi, { AAPL: quote }, rates, now);
  assert.equal(valuation.value, 54_000);
  assert.equal(valuation.cost, 45_000);
  assert.equal(valuation.pnl, 9_000);
});

test("대시보드: 엔화 SBI 계좌에 넣고, 직접 입력과 겹치면 알린다", () => {
  assert.equal(pickSbiAccount([kb, { ...sbi, id: "sbi-usd", homeCurrency: "USD" }, sbi])?.id, "sbi");
  assert.equal(pickSbiAccount([kb]), null);

  const manual: Holding = {
    id: "h1",
    accountId: "sbi",
    market: "JP",
    code: "7203",
    quoteSymbol: "7203.T",
    name: "トヨタ",
    quantity: 1,
    avgCost: 1,
    updatedAt: asOf,
  };
  const d = sbiForDashboard(loaded(), [kb, sbi], [manual]);
  assert.equal(d.account?.id, "sbi");
  assert.equal(d.holdings.length, 3);
  assert.ok(d.holdings.every((h) => h.accountId === "sbi"));
  assert.equal(d.warnings.length, 1);
  assert.ok(d.warnings[0].includes("トヨタ"));
});

test("대시보드: SBI 계좌가 없거나 CSV 가 깨졌으면 넣지 않고 알린다", () => {
  const noAccount = sbiForDashboard(loaded(), [kb], []);
  assert.equal(noAccount.holdings.length, 0);
  assert.equal(noAccount.warnings.length, 1);

  const broken = sbiForDashboard({ ...loaded(), parsed: { ok: false, error: "x" } }, [sbi], []);
  assert.equal(broken.holdings.length, 0);
  assert.equal(broken.warnings.length, 1);

  assert.equal(sbiForDashboard(null, [sbi], []).holdings.length, 0);
});

test("대시보드: 미국주식 추정 잔고는 사용자가 확인한 뒤에만 반영한다", () => {
  const pending = sbiForDashboard(null, [sbi], [], loadedUs(true), rates);
  assert.equal(pending.holdings.length, 0);
  assert.equal(pending.asOf, null);
  assert.ok(pending.warnings.some((warning) => warning.includes("대시보드에서 제외")));

  const confirmed = sbiForDashboard(null, [sbi], [], loadedUs(false), rates);
  assert.equal(confirmed.holdings.length, 1);
  assert.equal(confirmed.holdings[0].code, "AAPL");
  assert.equal(confirmed.asOf, asOf);
});
