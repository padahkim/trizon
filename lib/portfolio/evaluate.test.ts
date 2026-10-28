import { expect, it } from "vitest";
import { evaluate } from "./evaluate";
import { parsePortfolio } from "../sbi/portfolio";
import { portfolioUtf8 } from "../sbi/fixtures";

it("values every holding using CSV prices with zero day change and sums market, broker, country and summary in yen", () => {
  const result = evaluate(parsePortfolio(portfolioUtf8, new Date("2026-10-28T00:00:00Z")));
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
