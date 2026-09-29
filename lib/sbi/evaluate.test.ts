import { test } from "node:test";
import assert from "node:assert/strict";
import type { Account, Holding } from "../domain/schema.ts";
import { makeRates } from "../portfolio/fx.ts";
import type { Quote } from "../quotes/types.ts";
import { evaluateMargin, pickSbiAccount, sbiForDashboard, sbiHoldings, valueSbiHoldings, withFallback } from "./evaluate.ts";
import { PORTFOLIO_CSV } from "./fixtures.ts";
import { parsePortfolio, type LoadedImport } from "./parse.ts";
import type { SbiPortfolio } from "./types.ts";

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

test("계좌통화가 엔이 아니면 신용 손익도 계좌통화로 바꿔 더한다", () => {
  const h = sbiHoldings(portfolio(), "sbi-usd", asOf);
  const quotes = withFallback(h.fundQuotes, h.csvQuotes);
  const jpy = valueSbiHoldings(h, sbi, quotes, rates, now);
  const usd = valueSbiHoldings(h, { ...sbi, id: "sbi-usd", homeCurrency: "USD" }, quotes, rates, now);
  // 含み損益 156,000엔 (신용 19,000엔 포함) ÷ 150엔/달러
  assert.ok(Math.abs(usd.pnl - 156_000 / 150) < 1e-9, `${usd.pnl}`);
  assert.ok(Math.abs((usd.returnRate ?? 0) - (jpy.returnRate ?? 0)) < 1e-12);
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
  // 두 번 더해진 합계가 그날 스냅샷으로 남지 않게 한다
  assert.equal(d.unreliable, true);
  assert.equal(sbiForDashboard(loaded(), [kb, sbi], []).unreliable, false);
});

test("대시보드: SBI 계좌가 없거나 CSV 가 깨졌으면 넣지 않고 알린다", () => {
  const noAccount = sbiForDashboard(loaded(), [kb], []);
  assert.equal(noAccount.holdings.length, 0);
  assert.equal(noAccount.warnings.length, 1);

  const broken = sbiForDashboard({ ...loaded(), parsed: { ok: false, error: "x" } }, [sbi], []);
  assert.equal(broken.holdings.length, 0);
  assert.equal(broken.warnings.length, 1);
  // 넣은 CSV 를 읽지 못하면 합계에서 빠진 것이므로 스냅샷을 남기지 않는다. 계좌가 없는 것은 설정이라 괜찮다
  assert.equal(broken.unreliable, true);
  assert.equal(noAccount.unreliable, false);

  assert.equal(sbiForDashboard(null, [sbi], []).holdings.length, 0);
});
