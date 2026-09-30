import type { Account, Holding } from "../domain/schema.ts";
import { quoteSymbolCandidates } from "../domain/symbols.ts";
import { evaluateHolding, isQuoteStale, sumTotals, type HoldingEval, type PriceStatus } from "../portfolio/calc.ts";
import { convert, type FxRates } from "../portfolio/fx.ts";
import type { Quote } from "../quotes/types.ts";
import type { LoadedImport, LoadedUsTrades } from "./parse.ts";
import type { PortfolioMargin, SbiPortfolio, SbiUsHolding } from "./types.ts";

// SBI 포트폴리오 CSV → 평가. CSV 에서는 수량·취득단가만 쓰고 현재가는 시세 서버에서 받는다.
// - 주식: Yahoo 시세. 못 받으면 저장된 시세, 그것도 없으면 CSV 의 현재가.
// - 투자신탁: Yahoo 에 없다. CSV 의 기준가를 "가져온 시세"(Quote.imported)로 쓴다.
// - 신용: 자산이 아니라서 대시보드에는 넣지 않고, SBI 화면의 평가손익에만 더한다 (SBI 総合計와 같은 방식).
// 가상 보유종목은 portfolio.json 에 쓰지 않는다 — CSV 를 다시 넣으면 통째로 바뀐다.

const FUND_PREFIX = "sbi-fund:";
export const isSbiFundSymbol = (symbol: string) => symbol.startsWith(FUND_PREFIX);

export type SbiMarginPosition = { position: PortfolioMargin; symbol: string };

/** 預り 구분(特定·NISA …) 하나의 보유분. holding.quoteSymbol 은 합친 보유종목과 같다 */
export type SbiLot = { holding: Holding; accountType: string };

export type SbiHoldings = {
  /** 대시보드용: 같은 종목이 特定·NISA 에 나뉘어 있으면 한 줄로 합치고, 평균단가는 가중평균 */
  holdings: Holding[];
  /** SBI 화면용: 같은 종목도 預り 구분마다 한 줄. 같은 종목끼리 붙어 있다 */
  lots: SbiLot[];
  /** 투자신탁의 CSV 기준가. 시세 조회 대상에서 빼고 그대로 쓴다 */
  fundQuotes: Record<string, Quote>;
  /** 주식의 CSV 현재가. 시세를 못 받았을 때만 쓴다 */
  csvQuotes: Record<string, Quote>;
  margins: SbiMarginPosition[];
};

const emptySbiHoldings = (): SbiHoldings => ({ holdings: [], lots: [], fundQuotes: {}, csvQuotes: {}, margins: [] });

export function mergeSbiHoldings(...parts: readonly SbiHoldings[]): SbiHoldings {
  const out = emptySbiHoldings();
  for (const part of parts) {
    out.holdings.push(...part.holdings);
    out.lots.push(...part.lots);
    out.margins.push(...part.margins);
    Object.assign(out.fundQuotes, part.fundQuotes);
    Object.assign(out.csvQuotes, part.csvQuotes);
  }
  return out;
}

type Amount = { quantity: number; cost: number };
type Group = Amount & { name: string; price: number | null; unitSize: number; lots: Map<string, Amount> };

function addTo(groups: Map<string, Group>, key: string, row: Omit<Group, "cost" | "lots"> & { unitCost: number; accountType: string }) {
  const g = groups.get(key) ?? { name: row.name, quantity: 0, cost: 0, price: row.price, unitSize: row.unitSize, lots: new Map<string, Amount>() };
  const lot = g.lots.get(row.accountType) ?? { quantity: 0, cost: 0 };
  for (const a of [g, lot]) {
    a.quantity += row.quantity;
    a.cost += row.quantity * row.unitCost;
  }
  g.price ??= row.price;
  g.lots.set(row.accountType, lot);
  groups.set(key, g);
}

/** 합친 보유종목 → 預り 구분별 보유분 */
function pushLots(out: SbiHoldings, holding: Holding, g: Group) {
  for (const [accountType, lot] of g.lots) {
    out.lots.push({ accountType, holding: { ...holding, id: `${holding.id}:${accountType}`, quantity: lot.quantity, avgCost: lot.cost / lot.quantity } });
  }
}

const csvQuote = (symbol: string, price: number, asOf: string, name: string): Quote => ({
  symbol,
  price,
  currency: "JPY",
  marketTime: asOf,
  name,
  imported: true,
});

function jpSymbol(code: string): string | null {
  const r = quoteSymbolCandidates("JP", code);
  return r.ok ? r.candidates[0] : null;
}

/** CSV 보유종목 → 가상 보유종목 (accountId 계좌에 넣는다). asOf = CSV 를 받은 시각 */
export function sbiHoldings(portfolio: SbiPortfolio, accountId: string, asOf: string): SbiHoldings {
  const out = emptySbiHoldings();

  const stocks = new Map<string, Group>();
  for (const s of portfolio.stocks) addTo(stocks, s.code, { ...s, unitSize: 1 });
  for (const [code, g] of stocks) {
    const symbol = jpSymbol(code);
    if (!symbol) continue;
    const holding: Holding = {
      id: `sbi-csv-${code}`,
      accountId,
      market: "JP",
      code,
      quoteSymbol: symbol,
      name: g.name,
      quantity: g.quantity,
      avgCost: g.cost / g.quantity,
      updatedAt: asOf,
    };
    out.holdings.push(holding);
    pushLots(out, holding, g);
    if (g.price !== null) out.csvQuotes[symbol] = csvQuote(symbol, g.price, asOf, g.name);
  }

  const funds = new Map<string, Group>();
  for (const f of portfolio.funds) addTo(funds, f.name, f);
  [...funds.values()].forEach((g, i) => {
    const symbol = `${FUND_PREFIX}${g.name}`;
    const holding: Holding = {
      id: `sbi-csv-fund-${i + 1}`,
      accountId,
      market: "JP",
      code: "投資信託",
      quoteSymbol: symbol,
      name: g.name,
      quantity: g.quantity,
      avgCost: g.cost / g.quantity,
      priceUnit: g.unitSize,
      updatedAt: asOf,
    };
    out.holdings.push(holding);
    pushLots(out, holding, g);
    if (g.price !== null) out.fundQuotes[symbol] = csvQuote(symbol, g.price, asOf, g.name);
  });

  for (const m of portfolio.margins) {
    const symbol = jpSymbol(m.code);
    if (!symbol) continue;
    out.margins.push({ position: m, symbol });
  }
  return out;
}

/** 확인·보정한 미국주식 잔고 → SBI 가상 보유종목. JPY 취득단가는 계좌통화 총매입액으로 보존한다. */
export function sbiUsHoldings(rows: readonly SbiUsHolding[], account: Account, asOf: string, rates?: FxRates): SbiHoldings {
  const out = emptySbiHoldings();
  const groups = new Map<string, { lots: Holding[]; name: string; code: string }>();

  for (const row of rows) {
    const symbol = quoteSymbolCandidates("US", row.ticker);
    if (!symbol.ok) continue;
    const avgCost = row.costCurrency === "USD" ? row.avgCost : rates ? convert(row.avgCost, "JPY", "USD", rates) : 0;
    const basisJpy = row.costCurrency === "JPY" ? row.avgCost * row.quantity : undefined;
    const costBasisHome =
      basisJpy === undefined
        ? undefined
        : account.homeCurrency === "JPY"
          ? basisJpy
          : rates
            ? convert(basisJpy, "JPY", account.homeCurrency, rates)
            : undefined;
    const holding: Holding = {
      id: row.id,
      accountId: account.id,
      market: "US",
      code: symbol.code,
      quoteSymbol: symbol.candidates[0],
      name: row.name,
      quantity: row.quantity,
      avgCost,
      ...(costBasisHome !== undefined ? { costBasisHome } : {}),
      updatedAt: asOf,
    };
    out.lots.push({ accountType: row.accountType, holding });
    const group = groups.get(holding.quoteSymbol) ?? { lots: [], name: row.name, code: symbol.code };
    group.lots.push(holding);
    groups.set(holding.quoteSymbol, group);
  }

  for (const [quoteSymbol, group] of groups) {
    const quantity = group.lots.reduce((sum, holding) => sum + holding.quantity, 0);
    const costTrade = group.lots.reduce((sum, holding) => sum + holding.quantity * holding.avgCost, 0);
    const hasKnownHomeBasis = group.lots.some((holding) => holding.costBasisHome !== undefined);
    const costBasisHome =
      hasKnownHomeBasis && rates
        ? group.lots.reduce(
            (sum, holding) =>
              sum +
              (holding.costBasisHome ?? convert(holding.quantity * holding.avgCost, "USD", account.homeCurrency, rates)),
            0,
          )
        : group.lots.every((holding) => holding.costBasisHome !== undefined)
          ? group.lots.reduce((sum, holding) => sum + (holding.costBasisHome ?? 0), 0)
          : undefined;
    out.holdings.push({
      id: `sbi-us-csv-${group.code}`,
      accountId: account.id,
      market: "US",
      code: group.code,
      quoteSymbol,
      name: group.name,
      quantity,
      avgCost: quantity > 0 ? costTrade / quantity : 0,
      ...(costBasisHome !== undefined ? { costBasisHome } : {}),
      updatedAt: asOf,
    });
  }
  return out;
}

/** 시세 서버 결과에 없는 심볼만 fallback 으로 채운다 */
export function withFallback(quotes: Readonly<Record<string, Quote>>, fallback: Readonly<Record<string, Quote>>): Record<string, Quote> {
  const out = { ...quotes };
  for (const [symbol, q] of Object.entries(fallback)) out[symbol] ??= q;
  return out;
}

export type MarginEval = SbiMarginPosition & { price: number | null; priceStatus: PriceStatus; pnl: number };

export function evaluateMargin({ position, symbol }: SbiMarginPosition, quote: Quote | undefined, now: Date): MarginEval {
  const sign = position.side === "buy" ? 1 : -1;
  // SBI 의 損益 = (현재가 − 建単価) × 수량 − 금리·수수료 등. CSV 시점의 값으로 그 비용을 구해 두고 계속 뺀다
  const costs =
    position.price !== null && position.pnl !== null ? sign * (position.price - position.openPrice) * position.quantity - position.pnl : 0;
  // 시세가 없으면 CSV 시점의 SBI 損益을 그대로 쓴다. 같은 종목이라도 CSV 의 현물 표와 신용 표는
  // 현재값이 다를 때가 있어서(2026-09 관측: 2,919 / 2,929) 현물 표의 CSV 가격으로 다시 계산하지 않는다
  const usable = quote && !quote.imported && quote.currency === "JPY" && quote.price > 0 ? quote : undefined;
  if (!usable) {
    return { position, symbol, price: position.price, priceStatus: position.pnl !== null ? "imported" : "missing", pnl: position.pnl ?? 0 };
  }
  return {
    position,
    symbol,
    price: usable.price,
    priceStatus: isQuoteStale(usable, now) ? "stale" : "ok",
    pnl: sign * (usable.price - position.openPrice) * position.quantity - costs,
  };
}

export type SbiLotEval = HoldingEval & { accountType: string };

export type SbiValuation = {
  /** 預り 구분별 (같은 종목이 特定·NISA 에 있으면 두 줄) */
  stocks: SbiLotEval[];
  funds: SbiLotEval[];
  margins: MarginEval[];
  /** 계좌통화 기준. 평가액·매입금액에 신용은 넣지 않는다 (SBI 総合計와 같다) */
  value: number;
  cost: number;
  /** 신용 손익 포함 */
  pnl: number;
  /** 신용은 建代金(建単価 × 수량)을 매입금액에 더해 나눈다 */
  returnRate: number | null;
};

export function valueSbiHoldings(
  sbi: SbiHoldings,
  account: Account,
  quotes: Readonly<Record<string, Quote>>,
  rates: FxRates,
  now: Date,
): SbiValuation {
  const evals: SbiLotEval[] = sbi.lots.map((l) => ({
    ...evaluateHolding(l.holding, account, quotes[l.holding.quoteSymbol], rates, now),
    accountType: l.accountType,
  }));
  const margins = sbi.margins.map((m) => evaluateMargin(m, quotes[m.symbol], now));
  const totals = sumTotals(evals, account.homeCurrency, rates);
  const marginPnl = margins.reduce((s, m) => s + m.pnl, 0);
  const marginOpen = margins.reduce((s, m) => s + m.position.openPrice * m.position.quantity, 0);
  const pnl = totals.pnl + marginPnl;
  return {
    stocks: evals.filter((e) => !isSbiFundSymbol(e.holding.quoteSymbol)),
    funds: evals.filter((e) => isSbiFundSymbol(e.holding.quoteSymbol)),
    margins,
    value: totals.value,
    cost: totals.cost,
    pnl,
    returnRate: totals.cost + marginOpen > 0 ? pnl / (totals.cost + marginOpen) : null,
  };
}

// ── 대시보드 ────────────────────────────────────────────────

/** SBI CSV 보유종목을 넣을 계좌: 엔화 SBI 계좌 → 아무 SBI 계좌 */
export function pickSbiAccount(accounts: readonly Account[]): Account | null {
  return accounts.find((a) => a.broker === "SBI" && a.homeCurrency === "JPY") ?? accounts.find((a) => a.broker === "SBI") ?? null;
}

export type SbiDashboard = Pick<SbiHoldings, "holdings" | "fundQuotes" | "csvQuotes"> & {
  account: Account | null;
  /** CSV 를 받은 시각 */
  asOf: string | null;
  warnings: string[];
};

export const EMPTY_SBI_DASHBOARD: SbiDashboard = { account: null, asOf: null, holdings: [], fundQuotes: {}, csvQuotes: {}, warnings: [] };

export function sbiForDashboard(
  loaded: LoadedImport<SbiPortfolio> | null,
  accounts: readonly Account[],
  manualHoldings: readonly Holding[],
  usTrades: LoadedUsTrades | null = null,
  rates?: FxRates,
): SbiDashboard {
  if (!loaded && !usTrades) return EMPTY_SBI_DASHBOARD;
  const warnings: string[] = [];
  if (loaded && !loaded.parsed.ok) warnings.push(`SBI 포트폴리오 CSV를 읽지 못해 일본 보유종목을 넣지 않았습니다: ${loaded.parsed.error}`);
  if (usTrades && !usTrades.parsed.ok) warnings.push(`SBI 미국주식 약정이력 CSV를 다시 읽지 못했습니다: ${usTrades.parsed.error}`);
  const account = pickSbiAccount(accounts);
  if (!account) {
    return {
      ...EMPTY_SBI_DASHBOARD,
      warnings: [...warnings, "SBI証券 계좌가 없어 SBI CSV의 보유종목을 대시보드에 넣지 않았습니다 — 보유종목 관리에서 SBI 계좌를 추가하세요"],
    };
  }
  const parts: SbiHoldings[] = [];
  if (loaded?.parsed.ok) {
    parts.push(sbiHoldings(loaded.parsed.data, account.id, loaded.asOf));
    if (loaded.parsed.warnings.length > 0) warnings.push(`SBI 포트폴리오 CSV 확인 필요 ${loaded.parsed.warnings.length}건 — SBI 손익 화면에서 볼 수 있습니다`);
  }
  if (usTrades) {
    if (usTrades.needsReview) warnings.push("SBI 미국주식 추정 잔고를 아직 확인하지 않아 대시보드에서 제외했습니다 — SBI 손익 화면에서 수량과 평균단가를 확인하세요");
    else parts.push(sbiUsHoldings(usTrades.holdings, account, usTrades.asOf, rates));
    if (usTrades.parsed.ok && usTrades.parsed.warnings.length > 1) {
      warnings.push(`SBI 미국주식 약정이력 확인 필요 ${usTrades.parsed.warnings.length - 1}건 — SBI 손익 화면에서 볼 수 있습니다`);
    }
  }
  const sbi = mergeSbiHoldings(...parts);
  const csvSymbols = new Set(sbi.holdings.map((h) => h.quoteSymbol));
  const overlap = manualHoldings.filter((h) => h.accountId === account.id && csvSymbols.has(h.quoteSymbol));
  if (overlap.length > 0) {
    warnings.push(
      `${account.label}에 CSV로 가져온 종목과 직접 입력한 종목이 겹쳐 두 번 더해졌습니다: ${overlap.map((h) => h.name).join(", ")} — 보유종목 관리에서 직접 입력한 쪽을 지우세요`,
    );
  }
  const asOf = [loaded?.asOf, usTrades && !usTrades.needsReview ? usTrades.asOf : null]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  return { account, asOf, holdings: sbi.holdings, fundQuotes: sbi.fundQuotes, csvQuotes: sbi.csvQuotes, warnings };
}
