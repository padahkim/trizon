import { brokerCountry, marketCurrency, type Broker, type Currency, type Holding, type Market } from "./types";

export type Row = { holding: Holding; price: number; priceSource: "csv" | "cost"; value: number; pnl: number; dayChange: number };
export type Total = { value: number; pnl: number; dayChange: number; noQuote: number };
export type Totals = Partial<Record<Currency, Total>>;
type MarketGroup = { market: Market; totals: Totals; rows: Row[] };
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

/** CSV snapshots are the only price source until the quotes ticket is implemented. */
export function evaluate(holdings: Holding[]): Portfolio {
  const portfolio: Portfolio = { totals: {}, countries: [] };
  for (const holding of holdings) {
    const countryId = brokerCountry[holding.broker];
    let country = portfolio.countries.find((entry) => entry.country === countryId);
    if (!country) { country = { country: countryId, totals: {}, brokers: [] }; portfolio.countries.push(country); }
    let broker = country.brokers.find((entry) => entry.broker === holding.broker);
    if (!broker) { broker = { broker: holding.broker, totals: {}, markets: [] }; country.brokers.push(broker); }
    let market = broker.markets.find((entry) => entry.market === holding.market);
    if (!market) { market = { market: holding.market, totals: {}, rows: [] }; broker.markets.push(market); }
    const price = holding.csvQuote?.price ?? holding.avgCost;
    const row: Row = { holding, price, priceSource: holding.csvQuote ? "csv" : "cost", value: price * holding.quantity, pnl: (price - holding.avgCost) * holding.quantity, dayChange: 0 };
    market.rows.push(row);
    for (const totals of [market.totals, broker.totals, country.totals, portfolio.totals]) add(totals, marketCurrency[holding.market], row);
  }
  return portfolio;
}
