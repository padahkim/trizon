import { brokerCountry, marketCurrency, type Broker, type Currency, type Holding, type Market } from "./types";
import type { Quotes } from "../quotes/types";

export type PriceSource = "quote" | "csv" | "cost";
export type Row = { holding: Holding; price: number; priceSource: PriceSource; value: number; pnl: number; dayChange: number; marketTime?: string };
export type Total = { value: number; pnl: number; dayChange: number; noQuote: number };
export type Totals = Partial<Record<Currency, Total>>;
type MarketGroup = { market: Market; totals: Totals; rows: Row[]; marketTime?: string };
type BrokerGroup = { broker: Broker; totals: Totals; markets: MarketGroup[] };
type CountryGroup = { country: "JP" | "KR"; totals: Totals; brokers: BrokerGroup[] };
export type Portfolio = { totals: Totals; countries: CountryGroup[] };

function add(totals: Totals, currency: Currency, row: Row) {
  const total = totals[currency] ??= { value: 0, pnl: 0, dayChange: 0, noQuote: 0 };
  total.value += row.value;
  total.pnl += row.pnl;
  total.dayChange += row.dayChange;
  total.noQuote += row.priceSource === "cost" ? 1 : 0;
}

export function evaluate(holdings: Holding[], quotes: Quotes = {}, now = new Date()): Portfolio {
  const portfolio: Portfolio = { totals: {}, countries: [] };
  for (const holding of holdings) {
    const countryId = brokerCountry[holding.broker];
    let country = portfolio.countries.find((entry) => entry.country === countryId);
    if (!country) { country = { country: countryId, totals: {}, brokers: [] }; portfolio.countries.push(country); }
    let broker = country.brokers.find((entry) => entry.broker === holding.broker);
    if (!broker) { broker = { broker: holding.broker, totals: {}, markets: [] }; country.brokers.push(broker); }
    let market = broker.markets.find((entry) => entry.market === holding.market);
    if (!market) { market = { market: holding.market, totals: {}, rows: [] }; broker.markets.push(market); }
    const candidate = quotes[`${holding.market}:${holding.code}`];
    const quote = candidate && candidate.currency === marketCurrency[holding.market]
      && new Date(candidate.marketTime).getTime() >= now.getTime() - 7 * 86_400_000
      ? candidate : undefined;
    const price = quote?.price ?? holding.csvQuote?.price ?? holding.avgCost;
    const row: Row = {
      holding, price, priceSource: quote ? "quote" : holding.csvQuote ? "csv" : "cost",
      value: price * holding.quantity, pnl: (price - holding.avgCost) * holding.quantity,
      dayChange: quote?.previousClose === undefined ? 0 : (price - quote.previousClose) * holding.quantity,
      marketTime: quote?.marketTime,
    };
    // Show the oldest valid timestamp so the market label never overstates freshness.
    if (row.marketTime && (!market.marketTime || Date.parse(row.marketTime) < Date.parse(market.marketTime))) market.marketTime = row.marketTime;
    market.rows.push(row);
    for (const totals of [market.totals, broker.totals, country.totals, portfolio.totals]) add(totals, marketCurrency[holding.market], row);
  }
  return portfolio;
}
