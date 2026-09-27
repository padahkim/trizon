import { MARKETS, TRADE_CURRENCY, type Currency, type Market } from "../domain/model.ts";
import type { Account, Holding } from "../domain/schema.ts";
import type { Quote } from "../quotes/types.ts";
import { convert, type FxRates } from "./fx.ts";

// 계산 규칙 (계획서 "계산 규칙" 절):
// - 종목은 계좌통화(home) 기준으로 평가한다 → 증권사 화면의 수익률과 같은 값.
// - 합계는 계좌별 home 금액을 "현재 환율"로 표시 통화에 모은다. 그래서 총수익률(%)은
//   표시 통화를 무엇으로 바꿔도 같다. 대신 원↔엔 교차환율 변동은 수익률에 들어가지 않는다.
// - 이 모델은 증권사 화면의 사본이므로 평가손익(미실현)만 다룬다.

export type PriceStatus = "ok" | "stale" | "missing";

export type HoldingEval = {
  holding: Holding;
  account: Account;
  tradeCurrency: Currency;
  homeCurrency: Currency;
  quote: Quote | null;
  price: number | null;
  priceStatus: PriceStatus;
  valueTrade: number;
  costTrade: number;
  /** 주가 수익률 (거래통화 기준, 환율 효과 제외). 계산 불가면 null */
  returnTrade: number | null;
  valueHome: number;
  costHome: number;
  pnlHome: number;
  /** 계좌통화 수익률 (증권사 화면 기준). 계산 불가면 null */
  returnHome: number | null;
  /** false = 해외 종목인데 계좌통화 매입금액이 없어 현재 환율로 환산했다 (환율효과 미반영) */
  fxEffectIncluded: boolean;
};

export type Totals = { value: number; cost: number; pnl: number; returnRate: number | null };

export type AccountView = {
  account: Account;
  holdings: HoldingEval[];
  /** 계좌통화 기준 */
  home: Totals;
  /** 표시 통화 기준 */
  display: Totals;
};

export type MarketShare = { market: Market; value: number; weight: number };

export type PortfolioView = {
  displayCurrency: Currency;
  holdings: HoldingEval[];
  /** 표시 통화 기준 합계 */
  total: Totals;
  /** 세 통화 모두의 합계 (헤더에 나머지 두 통화를 작게 보여줄 때) */
  totalIn: Record<Currency, Totals>;
  accounts: AccountView[];
  /** 표시 통화 기준 시장별 평가액과 비중(0~1) */
  byMarket: MarketShare[];
  counts: { missing: number; stale: number; fxNotIncluded: number };
};

/** 시세가 이 영업일 수보다 오래됐으면 stale (상장폐지·거래정지 의심) */
export const STALE_BUSINESS_DAYS = 5;

/** from 다음 날부터 to 까지(UTC 날짜 기준)의 평일 수 */
export function businessDaysBetween(from: Date, to: Date): number {
  const DAY = 86_400_000;
  const start = Math.floor(from.getTime() / DAY);
  const end = Math.floor(to.getTime() / DAY);
  if (end <= start) return 0;
  if (end - start > 60) return end - start; // 충분히 오래됨 — 정확히 셀 필요 없다
  let count = 0;
  for (let d = start + 1; d <= end; d++) {
    const weekday = new Date(d * DAY).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

export function isQuoteStale(quote: Quote, now: Date): boolean {
  if (quote.fromCache) return true;
  const t = new Date(quote.marketTime);
  if (Number.isNaN(t.getTime())) return true;
  return businessDaysBetween(t, now) > STALE_BUSINESS_DAYS;
}

export function evaluateHolding(
  holding: Holding,
  account: Account,
  quote: Quote | undefined,
  rates: FxRates,
  now: Date,
): HoldingEval {
  const tradeCurrency = TRADE_CURRENCY[holding.market];
  const homeCurrency = account.homeCurrency;
  const foreign = tradeCurrency !== homeCurrency;
  const hasBasis = foreign && holding.costBasisHome !== undefined;

  const costTrade = holding.quantity * holding.avgCost;
  const costHome = !foreign
    ? costTrade
    : hasBasis
      ? (holding.costBasisHome as number)
      : convert(costTrade, tradeCurrency, homeCurrency, rates);

  const base = { holding, account, tradeCurrency, homeCurrency, costTrade, costHome, fxEffectIncluded: !foreign || hasBasis };

  // 통화가 어긋난 시세는 쓰지 않는다 (엉뚱한 값을 곱하느니 미확인으로 드러낸다)
  const usable = quote && quote.currency === tradeCurrency && quote.price > 0 ? quote : undefined;
  if (!usable) {
    // 가격 미확인: 평가액 = 매입액으로 둔다. 합계에서 조용히 빠지면 총자산이 실제보다 작게 보인다.
    return {
      ...base,
      quote: quote ?? null,
      price: null,
      priceStatus: "missing",
      valueTrade: costTrade,
      returnTrade: null,
      valueHome: costHome,
      pnlHome: 0,
      returnHome: null,
    };
  }

  const valueTrade = holding.quantity * usable.price;
  const valueHome = convert(valueTrade, tradeCurrency, homeCurrency, rates);
  const pnlHome = valueHome - costHome;
  return {
    ...base,
    quote: usable,
    price: usable.price,
    priceStatus: isQuoteStale(usable, now) ? "stale" : "ok",
    valueTrade,
    returnTrade: costTrade > 0 ? valueTrade / costTrade - 1 : null,
    valueHome,
    pnlHome,
    returnHome: costHome > 0 ? pnlHome / costHome : null,
  };
}

export function sumTotals(evals: readonly HoldingEval[], currency: Currency, rates: FxRates): Totals {
  let value = 0;
  let cost = 0;
  for (const e of evals) {
    value += convert(e.valueHome, e.homeCurrency, currency, rates);
    cost += convert(e.costHome, e.homeCurrency, currency, rates);
  }
  const pnl = value - cost;
  return { value, cost, pnl, returnRate: cost > 0 ? pnl / cost : null };
}

export function buildPortfolioView(input: {
  accounts: readonly Account[];
  holdings: readonly Holding[];
  quotes: Readonly<Record<string, Quote>>;
  rates: FxRates;
  now: Date;
  displayCurrency: Currency;
}): PortfolioView {
  const { accounts, holdings, quotes, rates, now, displayCurrency } = input;
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const evals = holdings.map((h) => {
    const account = accountById.get(h.accountId);
    // 스키마 검증이 막아 주지만, 빠뜨리면 총자산이 줄어드니 조용히 넘기지 않는다
    if (!account) throw new Error(`없는 계좌를 참조하는 종목: ${h.id} → ${h.accountId}`);
    return evaluateHolding(h, account, quotes[h.quoteSymbol], rates, now);
  });

  const totalIn = {
    KRW: sumTotals(evals, "KRW", rates),
    JPY: sumTotals(evals, "JPY", rates),
    USD: sumTotals(evals, "USD", rates),
  };
  const total = totalIn[displayCurrency];

  const accountViews = accounts.map((account) => {
    const own = evals.filter((e) => e.account.id === account.id);
    return {
      account,
      holdings: own,
      home: sumTotals(own, account.homeCurrency, rates),
      display: sumTotals(own, displayCurrency, rates),
    };
  });

  const byMarket = MARKETS.map((market) => {
    const value = sumTotals(
      evals.filter((e) => e.holding.market === market),
      displayCurrency,
      rates,
    ).value;
    return { market, value, weight: total.value > 0 ? value / total.value : 0 };
  });

  return {
    displayCurrency,
    holdings: evals,
    total,
    totalIn,
    accounts: accountViews,
    byMarket,
    counts: {
      missing: evals.filter((e) => e.priceStatus === "missing").length,
      stale: evals.filter((e) => e.priceStatus === "stale").length,
      fxNotIncluded: evals.filter((e) => !e.fxEffectIncluded).length,
    },
  };
}
