import { expect, it } from "vitest";
import { holdingsFromTrades, mergeTrades, parseUsTrades } from "./us-trades";

const header = "国内約定日,銘柄,銘柄コード,商品区分,取引,預り区分,約定数量,約定単価,国内受渡日,受渡金額/決済損益";
const buy = "2026/10/01,US-A,TSTA,米国株式,現買,特定,4,50.00USD,2026/10/05,200.00USD";
const csv = (...rows: string[]) => new TextEncoder().encode(["約定履歴", header, ...rows].join("\r\n"));

it("starts at 기준 보유정보 and applies only trades after 기준일 without double counting", () => {
  const { trades } = parseUsTrades(csv(
    "2026/10/01,US-A,TSTA,米国株式,現売,特定,20,90USD,,1800USD",
    "2026/10/28,US-A,TSTA,米国株式,現買,特定,10,100USD,,1000USD",
    "2026/10/29,US-A,TSTA,米国株式,現買,特定,5,130USD,,650USD",
    "2026/10/30,US-A,TSTA,米国株式,現売,特定,3,140USD,,420USD",
  ));
  const baselines = [{ ticker: "TSTA", name: "US-A", account: "特定", asOf: "2026-10-28", quantity: 10, avgCost: 100 }];
  expect(holdingsFromTrades(trades, baselines)).toMatchObject({
    holdings: [{ code: "TSTA", account: "特定", quantity: 12, avgCost: 110 }], notices: [],
  });
});

it("includes stocks absent from CSV and isolates 기준 보유정보 by account", () => {
  const baseline = { ticker: "TSTA", name: "US-A", account: "特定", asOf: "2026-10-28", quantity: 10, avgCost: 100 };
  const { trades } = parseUsTrades(csv("2026/10/01,US-A,TSTA,米国株式,現買,NISA,2,20USD,,40USD"));
  expect(holdingsFromTrades(trades, [baseline]).holdings).toEqual([
    { broker: "SBI", market: "US", code: "TSTA", name: "US-A", account: "特定", quantity: 10, avgCost: 100 },
    { broker: "SBI", market: "US", code: "TSTA", name: "US-A", account: "NISA", quantity: 2, avgCost: 20 },
  ]);
});

it("keeps a zero-share 기준 보유정보 out of holdings and starts fresh after the cutoff", () => {
  const baseline = { ticker: "TSTA", name: "US-A", account: "特定", asOf: "2026-10-28", quantity: 0, avgCost: 0 };
  const old = parseUsTrades(csv(buy)).trades;
  expect(holdingsFromTrades(old, [baseline])).toEqual({ holdings: [], notices: [], issues: [] });
  const next = parseUsTrades(csv("2026/10/29,US-A,TSTA,米国株式,現買,特定,0.5,40USD,,20USD")).trades;
  expect(holdingsFromTrades(mergeTrades(old, next), [baseline]).holdings[0]).toMatchObject({ quantity: 0.5, avgCost: 40 });
});

it("resets baseline cost after closing and reports a sale beyond the corrected balance", () => {
  const baseline = { ticker: "TSTA", name: "US-A", account: "特定", asOf: "2026-10-28", quantity: 10, avgCost: 100 };
  const closed = parseUsTrades(csv("2026/10/29,US-A,TSTA,米国株式,現売,特定,10,90USD,,900USD")).trades;
  expect(holdingsFromTrades(closed, [baseline]).holdings).toEqual([]);
  const reopened = mergeTrades(closed, parseUsTrades(csv("2026/10/30,US-A,TSTA,米国株式,現買,特定,2,30USD,,60USD")).trades);
  expect(holdingsFromTrades(reopened, [baseline]).holdings[0]).toMatchObject({ quantity: 2, avgCost: 30 });
  const oversold = parseUsTrades(csv("2026/10/29,US-A,TSTA,米国株式,現売,特定,11,90USD,,990USD")).trades;
  expect(holdingsFromTrades(oversold, [baseline])).toMatchObject({ holdings: [], issues: [expect.objectContaining({ ticker: "TSTA", account: "特定", message: expect.stringContaining("기준 보유정보 이후") })] });
});

it("reads cash US trades by column name, preserves decimals and settlement currency, and skips unsupported trades", () => {
  const parsed = parseUsTrades(csv(
    buy,
    "2026/10/02,US-B,TSTB,米国株式,現売,NISA,2,25.50USD,2026/10/06,7000JPY",
    "not-a-date,ignored,OTHER,国内株式,現買,特定,broken,broken,,",
    "not-a-date,ignored,OTHER,米国株式,信用新買,特定,broken,broken,,",
  ));
  expect(parsed.trades).toMatchObject([
    { tradeDate: "2026-10-01", name: "US-A", ticker: "TSTA", side: "buy", account: "特定", quantity: 4, price: 50, settlement: { amount: 200, currency: "USD" } },
    { tradeDate: "2026-10-02", name: "US-B", ticker: "TSTB", side: "sell", account: "NISA", quantity: 2, price: 25.5, settlement: { amount: 7000, currency: "JPY" } },
  ]);
  expect(parsed.notices).toEqual(["건너뛴 거래 2건"]);
});

it("calculates moving average in date order, retaining the average on a partial sale", () => {
  const { trades } = parseUsTrades(csv(
    "2026/10/03,US-A,TSTA,米国株式,現買,特定,5,20USD,,100USD",
    "2026/10/02,US-A,TSTA,米国株式,現売,特定,5,99USD,,490USD",
    "2026/10/01,US-A,TSTA,米国株式,現買,特定,10,10USD,,100USD",
  ));
  expect(holdingsFromTrades(trades)).toEqual({
    holdings: [{ broker: "SBI", market: "US", code: "TSTA", name: "US-A", account: "特定", quantity: 10, avgCost: 15 }],
    notices: [], issues: [],
  });
  expect(trades[0].tradeDate).toBe("2026-10-03");
});

it("applies same-day buys before sells and starts a new cost after a position closes", () => {
  const sameDay = parseUsTrades(csv(
    "2026/10/02,US-A,TSTA,米国株式,現売,特定,5,99USD,,490USD",
    "2026/10/01,US-A,TSTA,米国株式,現買,特定,10,10USD,,100USD",
    "2026/10/02,US-A,TSTA,米国株式,現買,特定,10,20USD,,200USD",
  )).trades;
  expect(holdingsFromTrades(sameDay).holdings[0]).toMatchObject({ quantity: 15, avgCost: 15 });
  const closed = parseUsTrades(csv(
    "2026/10/01,US-A,TSTA,米国株式,現買,特定,4,10USD,,40USD",
    "2026/10/02,US-A,TSTA,米国株式,現売,特定,4,99USD,,390USD",
  )).trades;
  expect(holdingsFromTrades(closed)).toEqual({ holdings: [], notices: [], issues: [] });
  const reopened = mergeTrades(closed, parseUsTrades(csv("2026/10/03,US-A,TSTA,米国株式,現買,特定,2,25.5USD,,51USD")).trades);
  expect(holdingsFromTrades(reopened).holdings[0]).toMatchObject({ quantity: 2, avgCost: 25.5 });
});

it("excludes an oversold account with a named notice even if later buys make its net quantity positive", () => {
  const { trades } = parseUsTrades(csv(
    "2026/10/01,US-A,TSTA,米国株式,現売,特定,5,50USD,,250USD",
    "2026/10/02,US-A,TSTA,米国株式,現買,特定,10,10USD,,100USD",
    "2026/10/01,US-A,TSTA,米国株式,現買,NISA,2,20USD,,40USD",
    "2026/10/01,US-B,TSTB,米国株式,現売,特定,1,20USD,,20USD",
  ));
  expect(holdingsFromTrades(trades)).toEqual({
    holdings: [{ broker: "SBI", market: "US", code: "TSTA", name: "US-A", account: "NISA", quantity: 2, avgCost: 20 }],
    notices: ["US-A (TSTA · 特定): 계산할 수 없음: 2년 이전 매수분 필요", "US-B (TSTB · 特定): 계산할 수 없음: 2년 이전 매수분 필요"],
    issues: [
      { ticker: "TSTA", name: "US-A", account: "特定", message: "계산할 수 없음: 2년 이전 매수분 필요" },
      { ticker: "TSTB", name: "US-B", account: "特定", message: "계산할 수 없음: 2년 이전 매수분 필요" },
    ],
  });
});

it.each([
  ["25.00USD", 12.5],
  ["4000JPY", 10.25],
  ["４，０００ 円", 10.25],
  ["--", 10.25],
])("uses USD settlement including fees, otherwise quantity times the decimal price: %s", (settlement, avgCost) => {
  const { trades } = parseUsTrades(csv(`2026/10/01,US-A,TSTA,米国株式,現買,特定,2,10.25USD,,"${settlement}"`));
  expect(holdingsFromTrades(trades).holdings[0]).toMatchObject({ quantity: 2, avgCost });
  if (settlement.endsWith("円")) expect(trades[0].settlement).toEqual({ amount: 4000, currency: "JPY" });
});

it("does not mistake floating-point residues for overselling or a remaining holding", () => {
  const { trades } = parseUsTrades(csv(
    "2026/10/01,US-A,TSTA,米国株式,現買,特定,0.3,10USD,,3USD",
    "2026/10/02,US-A,TSTA,米国株式,現売,特定,0.1,20USD,,2USD",
    "2026/10/03,US-A,TSTA,米国株式,現売,特定,0.2,20USD,,4USD",
  ));
  expect(holdingsFromTrades(trades)).toEqual({ holdings: [], notices: [], issues: [] });
});

it.each(header.split(",").slice(0, 8))("requires the %s column before importing any trades", (column) => {
  const columns = header.split(",").filter((name) => name !== column);
  expect(() => parseUsTrades(new TextEncoder().encode(`約定履歴\n${columns.join(",")}`))).toThrow(/머리글/);
});

it("accepts a complete empty header, missing settlement columns, and decorated or reordered columns", () => {
  expect(parseUsTrades(csv())).toEqual({ trades: [], notices: [] });
  const { trades } = parseUsTrades(new TextEncoder().encode("国内約定日,銘柄コード,銘柄,取引,商品区分,預り区分,約定単価(USD),約定数量\n2026/10/01,BRK.B,US-A,現買,米国株式,特定,10.25,2"));
  expect(trades[0]).toMatchObject({ ticker: "BRK.B", quantity: 2, price: 10.25 });
  expect(trades[0].settlement).toBeUndefined();
});

it.each([
  buy.replace("2026/10/01", "2026/02/30"),
  buy.replace(",4,", ",oops,"),
  buy.replace(",4,", ",-1,"),
  buy.replace("50.00USD", "oops"),
  buy.replace("50.00USD", "50JPY"),
  buy.replace("200.00USD", "oops"),
])("rejects malformed supported rows with a line number instead of silently dropping trades: %s", (row) => {
  expect(() => parseUsTrades(csv(buy, row))).toThrow(/4행/);
});

it("warns when the export reaches 1,000 rows, including skipped trades", () => {
  const parsed = parseUsTrades(csv(...Array.from({ length: 1000 }, () => buy.replace("現買", "信用新買"))));
  expect(parsed.trades).toEqual([]);
  expect(parsed.notices).toEqual(["건너뛴 거래 1000건", expect.stringMatching(/1,000건.*기간을 나눠/)]);
});

it("counts overlapping exports once while preserving identical trades within one file and distinct settlement dates or currencies", () => {
  const first = parseUsTrades(csv(buy, buy)).trades;
  const nextBuy = buy.replaceAll("2026/10/01", "2026/10/02");
  const overlapping = parseUsTrades(csv(buy, buy, nextBuy)).trades;
  const merged = mergeTrades(first, overlapping);
  expect(merged).toHaveLength(3);
  expect(mergeTrades(merged, overlapping)).toEqual(merged);
  expect(first).toHaveLength(2);
  const distinct = parseUsTrades(csv(
    buy.replace("2026/10/05", "2026/10/06"),
    buy.replace("200.00USD", "200.00JPY"),
    buy.replace("200.00USD", "201.00USD"),
    buy.replace("特定", "NISA"),
  )).trades;
  expect(mergeTrades(merged, distinct)).toHaveLength(7);
});
