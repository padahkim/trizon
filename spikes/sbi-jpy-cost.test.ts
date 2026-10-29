import { expect, it } from "vitest";
import { holdingsFromTrades, mergeTrades, parseUsTrades, usHoldingBaselineSchema } from "../lib/sbi/us-trades";
import { analyzeSbiJpyCost } from "./sbi-jpy-cost";

const header = "国内約定日,銘柄,銘柄コード,商品区分,取引,預り区分,約定数量,約定単価,国内受渡日,受渡金額/決済損益";
const tradesFrom = (...rows: string[]) => parseUsTrades(new TextEncoder().encode(["約定履歴", header, ...rows].join("\n"))).trades;

it("knows the full JPY acquisition cost from a JPY buy settlement including fees", () => {
  const trades = tradesFrom("2026/10/01,US-A,TSTA,米国株式,現買,特定,2,100USD,,30300JPY");
  expect(analyzeSbiJpyCost(trades)).toEqual({
    positions: [{ ticker: "TSTA", name: "US-A", account: "特定", quantity: 2, cost: { status: "complete", amount: 30300 } }],
    issues: [],
  });
});

it.each([
  ["200USD", "usd-settlement"],
  ["--", "missing-settlement"],
  ["-30300JPY", "negative-jpy-settlement"],
])("keeps the historical JPY cost unknown for %s", (settlement, reason) => {
  const trades = tradesFrom(`2026/10/01,US-A,TSTA,米国株式,現買,特定,2,100USD,,${settlement}`);
  expect(analyzeSbiJpyCost(trades).positions[0]).toMatchObject({
    quantity: 2, cost: { status: "unknown", reasons: [reason] },
  });
});

it.each([["30000JPY", 30000], ["0JPY", 0]])("retains partial JPY evidence, including a confirmed zero: %s", (settlement, knownAmount) => {
  const trades = tradesFrom(
    `2026/10/01,US-A,TSTA,米国株式,現買,特定,2,100USD,,${settlement}`,
    "2026/10/02,US-A,TSTA,米国株式,現買,特定,1,100USD,,100USD",
    "2026/10/03,US-A,TSTA,米国株式,現買,特定,1,100USD,,--",
  );
  expect(analyzeSbiJpyCost(trades).positions[0]).toMatchObject({
    quantity: 4, cost: { status: "partial", knownAmount, reasons: ["usd-settlement", "missing-settlement"] },
  });
});

it("distinguishes a complete zero cost from an unknown cost", () => {
  const trades = tradesFrom("2026/10/01,US-A,TSTA,米国株式,現買,特定,2,0USD,,0JPY");
  expect(analyzeSbiJpyCost(trades).positions[0].cost).toEqual({ status: "complete", amount: 0 });
});

it.each([
  ["15000JPY", { status: "complete", amount: 15000 }],
  ["100USD", { status: "partial", knownAmount: 6000, reasons: ["usd-settlement"] }],
])("reduces remaining cost proportionally on a partial sale: %s", (settlement, expectedCost) => {
  const trades = tradesFrom(
    "2026/10/03,US-A,TSTA,米国株式,現売,特定,2,900USD,,270000JPY",
    "2026/10/01,US-A,TSTA,米国株式,現買,特定,4,10USD,,10000JPY",
    `2026/10/02,US-A,TSTA,米国株式,現買,特定,1,100USD,,${settlement}`,
  );
  // Complete: 25,000 * 3/5 = 15,000; partial: known 10,000 * 3/5 = 6,000.
  expect(analyzeSbiJpyCost(trades).positions[0]).toMatchObject({
    quantity: 3,
    cost: expectedCost,
  });
});

it.each(["100USD", "--"])("recovers complete JPY cost after closing a position with %s buys", (settlement) => {
  const closed = tradesFrom(
    `2026/10/01,US-A,TSTA,米国株式,現買,特定,2,100USD,,${settlement}`,
    "2026/10/02,US-A,TSTA,米国株式,現売,特定,2,200USD,,60000JPY",
  );
  expect(analyzeSbiJpyCost(closed).positions[0]).toMatchObject({ quantity: 0, cost: { status: "complete", amount: 0 } });
  const fresh = tradesFrom("2026/10/03,US-A,TSTA,米国株式,現買,特定,1,100USD,,16000JPY");
  expect(analyzeSbiJpyCost([...closed, ...fresh]).positions[0]).toMatchObject({ quantity: 1, cost: { status: "complete", amount: 16000 } });
});

it.each([0, 100])("keeps a positive USD 기준 보유정보 unknown even at a USD average of %s", (avgCost) => {
  const past = tradesFrom("2026/10/01,US-A,TSTA,米国株式,現買,特定,2,100USD,,30000JPY");
  const baseline = usHoldingBaselineSchema.parse({ ticker: "TSTA", name: "US-A", account: "特定", quantity: 2, avgCost, includedTradeKeys: past.map((trade) => trade.key) });
  expect(analyzeSbiJpyCost(past, [baseline]).positions[0]).toMatchObject({
    quantity: 2, cost: { status: "unknown", reasons: ["usd-baseline"] },
  });
});

it("excludes 반영된 거래 and retains only the proportional JPY evidence from a new same-day buy", () => {
  const past = tradesFrom("2026/10/01,US-A,TSTA,米国株式,現買,特定,2,100USD,,30000JPY");
  const baseline = usHoldingBaselineSchema.parse({ ticker: "TSTA", name: "US-A", account: "特定", quantity: 2, avgCost: 100, includedTradeKeys: past.map((trade) => trade.key) });
  const incoming = tradesFrom(
    "2026/10/01,US-A,TSTA,米国株式,現買,特定,2,100USD,,30000JPY",
    "2026/10/01,US-A,TSTA,米国株式,現買,特定,2,200USD,,60000JPY",
    "2026/10/01,US-A,TSTA,米国株式,現売,特定,1,900USD,,135000JPY",
  );
  const trades = mergeTrades(mergeTrades(past, incoming), incoming);
  expect(analyzeSbiJpyCost(trades, [baseline]).positions[0]).toMatchObject({
    quantity: 3, cost: { status: "partial", knownAmount: 45000, reasons: ["usd-baseline"] },
  });
  expect(holdingsFromTrades(trades, [baseline]).holdings[0]).toMatchObject({ quantity: 3, avgCost: 150 });
});

it.each(["keys", "date"])("restarts from a zero-share 기준 보유정보 using %s selection", (mode) => {
  const past = tradesFrom("2026/10/01,US-A,TSTA,米国株式,現買,特定,4,100USD,,60000JPY");
  const baseline = usHoldingBaselineSchema.parse({
    ticker: "TSTA", name: "US-A", account: "特定", quantity: 0, avgCost: 999,
    ...(mode === "keys" ? { includedTradeKeys: past.map((trade) => trade.key) } : { asOf: "2026-10-01" }),
  });
  expect(analyzeSbiJpyCost(past, [baseline]).positions[0]).toMatchObject({ quantity: 0, cost: { status: "complete", amount: 0 } });
  const sameDay = tradesFrom("2026/10/01,US-A,TSTA,米国株式,現買,特定,1,100USD,,15000JPY");
  const nextDay = tradesFrom("2026/10/02,US-A,TSTA,米国株式,現買,特定,2,100USD,,30000JPY");
  const trades = mergeTrades(past, [...sameDay, ...nextDay]);
  expect(analyzeSbiJpyCost(trades, [baseline]).positions[0]).toMatchObject(mode === "keys"
    ? { quantity: 3, cost: { status: "complete", amount: 45000 } }
    : { quantity: 2, cost: { status: "complete", amount: 30000 } });
});

it("keeps a positive date-based 기준 보유정보 unknown and excludes its entire cutoff day", () => {
  const trades = tradesFrom(
    "2026/10/01,US-A,TSTA,米国株式,現買,特定,2,100USD,,30000JPY",
    "2026/10/02,US-A,TSTA,米国株式,現買,特定,1,200USD,,30000JPY",
  );
  const baseline = usHoldingBaselineSchema.parse({ ticker: "TSTA", name: "US-A", account: "特定", quantity: 2, avgCost: 100, asOf: "2026-10-01" });
  expect(analyzeSbiJpyCost(trades, [baseline]).positions[0]).toMatchObject({
    quantity: 3, cost: { status: "partial", knownAmount: 30000, reasons: ["usd-baseline"] },
  });
});

it("rejects an oversold position even when later JPY buys leave a positive net quantity", () => {
  const trades = tradesFrom(
    "2026/10/01,US-A,TSTA,米国株式,現売,特定,2,100USD,,30000JPY",
    "2026/10/02,US-A,TSTA,米国株式,現買,特定,4,100USD,,60000JPY",
  );
  expect(analyzeSbiJpyCost(trades)).toEqual({
    positions: [], issues: [{ ticker: "TSTA", name: "US-A", account: "特定", reason: "oversold" }],
  });
});

it("uses synthetic values under the observed SBI trade header, including extra columns", () => {
  const observedHeader = "国内約定日,銘柄,銘柄コード,市場,商品区分,注文種別,取引,預り区分,約定数量,約定単価,国内受渡日,受渡金額/決済損益";
  const bytes = new TextEncoder().encode([
    "約定履歴", observedHeader,
    '2026/10/01,US-A,TSTA,NASDAQ,米国株式,指値,現買,特定,2,100USD,2026/10/05,"３０，３００ 円"',
  ].join("\r\n"));
  const { trades } = parseUsTrades(bytes);
  expect(analyzeSbiJpyCost(trades).positions[0]).toMatchObject({ quantity: 2, cost: { status: "complete", amount: 30300 } });
});

it("retains unknown baseline cost through a partial sale, then starts fresh on a later date", () => {
  const baseline = usHoldingBaselineSchema.parse({ ticker: "TSTA", name: "US-A", account: "特定", quantity: 4, avgCost: 100, includedTradeKeys: [] });
  const partialSale = tradesFrom("2026/10/01,US-A,TSTA,米国株式,現売,特定,2,100USD,,30000JPY");
  expect(analyzeSbiJpyCost(partialSale, [baseline]).positions[0]).toMatchObject({ quantity: 2, cost: { status: "unknown", reasons: ["usd-baseline"] } });
  const closeAndRebuy = tradesFrom(
    "2026/10/02,US-A,TSTA,米国株式,現売,特定,2,100USD,,30000JPY",
    "2026/10/03,US-A,TSTA,米国株式,現買,特定,1,200USD,,32000JPY",
  );
  expect(analyzeSbiJpyCost([...partialSale, ...closeAndRebuy], [baseline]).positions[0]).toMatchObject({ quantity: 1, cost: { status: "complete", amount: 32000 } });
});

it("follows same-day buy-first ordering without inferring a zero crossing from the CSV row order", () => {
  const baseline = usHoldingBaselineSchema.parse({ ticker: "TSTA", name: "US-A", account: "特定", quantity: 2, avgCost: 100, includedTradeKeys: [] });
  const trades = tradesFrom(
    "2026/10/01,US-A,TSTA,米国株式,現売,特定,2,100USD,,30000JPY",
    "2026/10/01,US-A,TSTA,米国株式,現買,特定,1,100USD,,15000JPY",
  );
  const originalOrder = trades.map((trade) => trade.key);
  expect(analyzeSbiJpyCost(trades, [baseline]).positions[0]).toMatchObject({ quantity: 1, cost: { status: "partial", knownAmount: expect.closeTo(5000, 8), reasons: ["usd-baseline"] } });
  expect(trades.map((trade) => trade.key)).toEqual(originalOrder);
});

it("keeps completeness separate by ticker and 預り区分, including baseline-only positions", () => {
  const baseline = usHoldingBaselineSchema.parse({ ticker: "TSTA", name: "US-A", account: "特定", quantity: 2, avgCost: 100, includedTradeKeys: [] });
  const trades = tradesFrom(
    "2026/10/01,US-A,TSTA,米国株式,現買,NISA,1,100USD,,15000JPY",
    "2026/10/01,US-B,TSTB,米国株式,現買,特定,1,100USD,,--",
  );
  expect(analyzeSbiJpyCost(trades, [baseline])).toEqual({
    positions: [
      { ticker: "TSTA", name: "US-A", account: "特定", quantity: 2, cost: { status: "unknown", reasons: ["usd-baseline"] } },
      { ticker: "TSTA", name: "US-A", account: "NISA", quantity: 1, cost: { status: "complete", amount: 15000 } },
      { ticker: "TSTB", name: "US-B", account: "特定", quantity: 1, cost: { status: "unknown", reasons: ["missing-settlement"] } },
    ], issues: [],
  });
});

it("does not carry a zero baseline's evidence into a fresh USD buy", () => {
  const baseline = usHoldingBaselineSchema.parse({ ticker: "TSTA", name: "US-A", account: "特定", quantity: 0, avgCost: 0, includedTradeKeys: [] });
  expect(analyzeSbiJpyCost([], [baseline]).positions[0]).toMatchObject({ quantity: 0, cost: { status: "complete", amount: 0 } });
  const trades = tradesFrom("2026/10/01,US-A,TSTA,米国株式,現買,特定,1,100USD,,100USD");
  expect(analyzeSbiJpyCost(trades, [baseline]).positions[0]).toMatchObject({ quantity: 1, cost: { status: "unknown", reasons: ["usd-settlement"] } });
});

it("resets completeness when fractional shares close without leaving a floating-point residue", () => {
  const trades = tradesFrom(
    "2026/10/01,US-A,TSTA,米国株式,現買,特定,0.3,100USD,,30USD",
    "2026/10/02,US-A,TSTA,米国株式,現売,特定,0.1,100USD,,1500JPY",
    "2026/10/03,US-A,TSTA,米国株式,現売,特定,0.2,100USD,,3000JPY",
    "2026/10/04,US-A,TSTA,米国株式,現買,特定,0.5,100USD,,7500JPY",
  );
  expect(analyzeSbiJpyCost(trades).positions[0]).toMatchObject({ quantity: 0.5, cost: { status: "complete", amount: 7500 } });
});

it.each([
  ["15000JPY", { status: "complete", amount: 15000 }],
  ["100USD", { status: "unknown", reasons: ["usd-settlement"] }],
])("clears both known and missing evidence after a mixed position closes, then buys with %s", (settlement, expectedCost) => {
  const trades = tradesFrom(
    "2026/10/01,US-A,TSTA,米国株式,現買,特定,1,100USD,,15000JPY",
    "2026/10/02,US-A,TSTA,米国株式,現買,特定,1,100USD,,100USD",
    "2026/10/03,US-A,TSTA,米国株式,現売,特定,2,100USD,,30000JPY",
    `2026/10/04,US-A,TSTA,米国株式,現買,特定,1,100USD,,${settlement}`,
  );
  expect(analyzeSbiJpyCost(trades).positions[0]).toMatchObject({ quantity: 1, cost: expectedCost });
});

it("cannot treat a sale from zero shares as a known zero crossing, even within the quantity tolerance", () => {
  const trades = tradesFrom(
    "2026/10/01,US-A,TSTA,米国株式,現売,特定,0.0000000001,100USD,,--",
    "2026/10/02,US-A,TSTA,米国株式,現買,特定,1,100USD,,15000JPY",
  );
  expect(analyzeSbiJpyCost(trades)).toEqual({
    positions: [], issues: [{ ticker: "TSTA", name: "US-A", account: "特定", reason: "oversold" }],
  });
});
