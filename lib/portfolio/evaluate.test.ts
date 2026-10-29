import { expect, it } from "vitest";
import { evaluate } from "./evaluate";
import { parsePortfolio } from "../sbi/portfolio";
import { portfolioUtf8 } from "../sbi/fixtures";
import type { Holding } from "./types";
import type { Quote } from "../quotes/types";

const now = new Date("2026-10-28T09:00:00Z");
const recent: Quote = { price: 1200, previousClose: 1150, currency: "JPY", marketTime: "2026-10-28T06:00:00Z" };

it("values fund units per 10,000 using the CSV price, separately from stocks in the yen total", () => {
  const fund: Holding = { broker: "SBI", account: "NISA(つみたて投資枠)", market: "JP", assetType: "fund", code: "架空ファンドA", name: "架空ファンドA", quantity: 12500, avgCost: 8000, csvQuote: { price: 10000, asOf: now.toISOString() } };
  const result = evaluate([...parsePortfolio(portfolioUtf8, now).holdings.slice(0, 1), fund], {
    "JP:1111": recent,
    "JP:架空ファンドA": { ...recent, price: 99999 },
  }, now);
  const markets = result.countries[0].brokers[0].markets;
  expect(markets).toHaveLength(2);
  expect(markets[1].rows[0]).toMatchObject({ priceSource: "csv", price: 10000, value: 12500, pnl: 2500, dayChange: 0 });
  expect(result.totals.JPY).toEqual({ value: 24500, pnl: 4500, dayChange: 500, noQuote: 0 });
  const withoutPrice = evaluate([{ ...fund, csvQuote: undefined }], {}, now);
  expect(withoutPrice.totals.JPY).toEqual({ value: 10000, pnl: 0, dayChange: 0, noQuote: 1 });
});

it("uses current and previous-close quotes for the PRD Japanese holdings", () => {
  const now = new Date("2026-10-28T09:00:00Z");
  const result = evaluate(parsePortfolio(portfolioUtf8, now).holdings, {
    "JP:1111": { price: 1200, previousClose: 1150, currency: "JPY", marketTime: "2026-10-28T06:00:00Z" },
    "JP:999A": { price: 800, previousClose: 820, currency: "JPY", marketTime: "2026-10-28T06:00:00Z" },
  }, now);
  const market = result.countries[0].brokers[0].markets[0];
  expect(market.rows.map(({ priceSource, value, pnl, dayChange }) => ({ priceSource, value, pnl, dayChange }))).toEqual([
    { priceSource: "quote", value: 12000, pnl: 2000, dayChange: 500 },
    { priceSource: "quote", value: 8000, pnl: -1000, dayChange: -200 },
  ]);
  expect(market.marketTime).toBe("2026-10-28T06:00:00Z");
  const totals = { JPY: { value: 20000, pnl: 1000, dayChange: 300, noQuote: 0 } };
  expect(result.totals).toEqual(totals);
  expect(result.countries[0].totals).toEqual(totals);
  expect(result.countries[0].brokers[0].totals).toEqual(totals);
  expect(market.totals).toEqual(totals);
});

it.each([
  ["missing", undefined],
  ["wrong currency", { ...recent, currency: "USD" }],
  ["over seven days old", { ...recent, marketTime: "2026-10-21T08:59:59Z" }],
  ["invalid timestamp", { ...recent, marketTime: "invalid" }],
] as const)("falls back to CSV, then cost, for a %s quote without dropping holdings", (_, quote) => {
  const [first, second] = parsePortfolio(portfolioUtf8, now).holdings;
  const holdings = [first, { ...second, csvQuote: undefined }];
  const result = evaluate(holdings, { "JP:1111": quote, "JP:999A": quote }, now);
  const market = result.countries[0].brokers[0].markets[0];
  expect(market.rows.map(({ price, priceSource, value, pnl, dayChange }) => ({ price, priceSource, value, pnl, dayChange }))).toEqual([
    { price: 1200, priceSource: "csv", value: 12000, pnl: 2000, dayChange: 0 },
    { price: 900, priceSource: "cost", value: 9000, pnl: 0, dayChange: 0 },
  ]);
  expect(result.totals).toEqual({ JPY: { value: 21000, pnl: 2000, dayChange: 0, noQuote: 1 } });
  expect(market.marketTime).toBeUndefined();
});

it("accepts a quote exactly seven days old and uses zero day change without a previous close", () => {
  const holdings = parsePortfolio(portfolioUtf8, now).holdings.slice(0, 1);
  const result = evaluate(holdings, { "JP:1111": { ...recent, previousClose: undefined, marketTime: "2026-10-21T09:00:00Z" } }, now);
  expect(result.totals).toEqual({ JPY: { value: 12000, pnl: 2000, dayChange: 0, noQuote: 0 } });
  expect(result.countries[0].brokers[0].markets[0].rows[0].priceSource).toBe("quote");
});

it("preserves dollar fractions and keeps currency totals separate at every level", () => {
  const us: Holding[] = [
    { broker: "SBI", account: "特定", market: "US", code: "ZZA", name: "US-A", quantity: 4, avgCost: 50 },
    { broker: "SBI", account: "特定", market: "US", code: "ZZB", name: "US-B", quantity: 2, avgCost: 20 },
  ];
  const result = evaluate([...parsePortfolio(portfolioUtf8, now).holdings, ...us], {
    "JP:1111": recent,
    "JP:999A": { ...recent, price: 800, previousClose: 820 },
    "US:ZZA": { ...recent, currency: "USD", price: 45.5, previousClose: 46 },
    "US:ZZB": { ...recent, currency: "USD", price: 25, previousClose: 24.5 },
  }, now);
  const totals = {
    JPY: { value: 20000, pnl: 1000, dayChange: 300, noQuote: 0 },
    USD: { value: 232, pnl: -8, dayChange: -1, noQuote: 0 },
  };
  expect(result.totals).toEqual(totals);
  expect(result.countries[0].totals).toEqual(totals);
  expect(result.countries[0].brokers[0].totals).toEqual(totals);
  const market = result.countries[0].brokers[0].markets[1];
  expect(market.totals).toEqual({ USD: totals.USD });
  expect(market.rows.map(({ value, pnl, dayChange }) => ({ value, pnl, dayChange }))).toEqual([
    { value: 182, pnl: -18, dayChange: -2 }, { value: 50, pnl: 10, dayChange: 1 },
  ]);
});

it("values every holding using CSV prices with zero day change and sums market, broker, country and summary in yen", () => {
  const result = evaluate(parsePortfolio(portfolioUtf8, new Date("2026-10-28T00:00:00Z")).holdings);
  const country = result.countries[0];
  const broker = country.brokers[0];
  const market = broker.markets[0];
  expect(market.rows.map(({ price, priceSource, value, pnl, dayChange }) => ({ price, priceSource, value, pnl, dayChange }))).toEqual([
    { price: 1200, priceSource: "csv", value: 12000, pnl: 2000, dayChange: 0 },
    { price: 800, priceSource: "csv", value: 8000, pnl: -1000, dayChange: 0 },
  ]);
  expect(market.totals).toEqual({ JPY: { value: 20000, pnl: 1000, dayChange: 0, noQuote: 0 } });
  expect(broker.totals).toEqual(market.totals);
  expect(country.totals).toEqual(market.totals);
  expect(result.totals).toEqual(market.totals);
  expect({ country: country.country, broker: broker.broker, market: market.market }).toEqual({ country: "JP", broker: "SBI", market: "JP" });
});
