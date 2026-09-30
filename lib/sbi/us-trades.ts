import type { Parsed, Period, SbiUsHolding, SbiUsTrade, SbiUsTrades } from "./types.ts";

// 여러 約定履歴 CSV는 기간이 겹칠 수 있다. 각 파일 안에서 완전히 같은 체결이 여러 번 있을 수 있으므로
// parseUsTrades가 붙인 occurrence-aware dedupeKey로 파일 사이의 중복만 제거한다.

export type MergedUsTrades = {
  period: Period | null;
  trades: SbiUsTrade[];
  duplicateCount: number;
  sourceRowCount: number;
  warnings: string[];
};

export function mergeUsTrades(parsed: readonly Parsed<SbiUsTrades>[]): MergedUsTrades {
  const good = parsed.filter((r): r is Extract<Parsed<SbiUsTrades>, { ok: true }> => r.ok);
  const byKey = new Map<string, SbiUsTrade>();
  let duplicateCount = 0;
  let sourceRowCount = 0;
  const warnings: string[] = [];

  for (const result of good) {
    sourceRowCount += result.data.sourceRowCount;
    warnings.push(...result.warnings);
    for (const trade of result.data.trades) {
      if (byKey.has(trade.dedupeKey)) duplicateCount++;
      else byKey.set(trade.dedupeKey, trade);
    }
  }

  const trades = [...byKey.values()].sort(compareTrades);
  const from = good.map((r) => r.data.period?.from).filter((v): v is string => Boolean(v)).sort()[0] ?? trades[0]?.date;
  const to = good
    .map((r) => r.data.period?.to)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1) ?? trades.at(-1)?.date;

  if (duplicateCount > 0) warnings.push(`겹치는 CSV에서 같은 체결 ${duplicateCount}건을 한 번만 반영했습니다`);
  warnings.push("SBI 미국주식 약정이력은 최근 2년까지만 제공됩니다 — 오래전부터 보유 중인 종목은 아래에서 추가·수정하세요");

  return {
    period: from && to ? { from, to } : null,
    trades,
    duplicateCount,
    sourceRowCount,
    warnings: unique(warnings),
  };
}

export type InferredUsHoldings = {
  holdings: SbiUsHolding[];
  closedCount: number;
  warnings: string[];
};

/**
 * 이동평균 취득단가로 현재 잔고를 추정한다. 매도에서 실현손익은 만들지 않는다.
 * 매도가 추적 중인 수량을 넘으면 2년 이전 보유분이 있다는 신호이므로 해당 lot은 자동 잔고에서 빼고 경고한다.
 */
export function inferUsHoldings(trades: readonly SbiUsTrade[]): InferredUsHoldings {
  const groups = new Map<string, SbiUsTrade[]>();
  for (const trade of trades) {
    const key = `${trade.ticker}\u0000${trade.accountType}`;
    const own = groups.get(key) ?? [];
    own.push(trade);
    groups.set(key, own);
  }

  const holdings: SbiUsHolding[] = [];
  const warnings: string[] = [];
  let closedCount = 0;

  for (const own of groups.values()) {
    const ordered = [...own].sort(compareForAverage);
    const first = ordered[0];
    let quantity = 0;
    let cost = 0;
    let oversold = false;
    let sameDayMixed = false;

    for (let i = 0; i < ordered.length; ) {
      const date = ordered[i].date;
      const day: SbiUsTrade[] = [];
      while (i < ordered.length && ordered[i].date === date) day.push(ordered[i++]);
      if (day.some((t) => t.side === "buy") && day.some((t) => t.side === "sell")) sameDayMixed = true;

      // 체결시각이 없으므로 같은 날은 매수를 먼저 반영한다. 결과는 추정값임을 UI에서 계속 표시한다.
      day.sort((a, b) => Number(a.side === "sell") - Number(b.side === "sell") || a.dedupeKey.localeCompare(b.dedupeKey));
      for (const trade of day) {
        if (trade.side === "buy") {
          quantity += trade.quantity;
          cost += trade.settlementAmount ?? trade.quantity * trade.unitPrice;
          continue;
        }
        if (trade.quantity > quantity + 1e-9) oversold = true;
        if (quantity > 0) cost -= (cost / quantity) * Math.min(quantity, trade.quantity);
        quantity -= trade.quantity;
        if (quantity <= 1e-9) cost = 0;
      }
    }

    const totalBuys = own.filter((t) => t.side === "buy").reduce((s, t) => s + t.quantity, 0);
    const totalSells = own.filter((t) => t.side === "sell").reduce((s, t) => s + t.quantity, 0);
    const net = clean(totalBuys - totalSells);
    const label = `${first.ticker} · ${first.accountType || "계좌구분 없음"}`;

    if (oversold || net < 0) {
      warnings.push(`${label}: 최근 2년 매도수량이 매수수량보다 많습니다 — 2년 이전 보유분과 현재 잔고를 확인하세요`);
      continue;
    }
    if (sameDayMixed) warnings.push(`${label}: 같은 날 매수·매도가 있어 취득단가는 매수를 먼저 반영한 추정값입니다`);
    if (!(net > 0)) {
      closedCount++;
      continue;
    }

    // 정상 흐름이면 quantity === net. 부동소수점 오차만 정리한다.
    quantity = net;
    const buyCost = own
      .filter((t) => t.side === "buy")
      .reduce((s, t) => s + (t.settlementAmount ?? t.quantity * t.unitPrice), 0);
    const buyQuantity = totalBuys;
    const avgCost = cost > 0 ? cost / quantity : buyQuantity > 0 ? buyCost / buyQuantity : 0;
    holdings.push({
      id: inferredId(first.ticker, first.accountType),
      ticker: first.ticker,
      name: own.at(-1)?.name || first.name,
      quantity,
      avgCost: clean(avgCost),
      costCurrency: "USD",
      accountType: first.accountType,
      source: "inferred",
    });
  }

  holdings.sort((a, b) => a.ticker.localeCompare(b.ticker) || a.accountType.localeCompare(b.accountType));
  return { holdings, closedCount, warnings: unique(warnings) };
}

/**
 * 확인을 마친 잔고에 새 CSV 추정치를 합친다.
 * - 손대지 않은 CSV 추정 행은 새 거래를 반영한다.
 * - 수정·직접 추가·삭제한 행은 사용자의 선택을 보존한다.
 * 새 CSV를 넣은 뒤에는 다시 확인받으므로, 보정한 행에 거래 증분을 임의로 적용하지 않는다.
 */
export function reconcileReviewedUsHoldings(
  previousInferred: readonly SbiUsHolding[],
  nextInferred: readonly SbiUsHolding[],
  reviewed: readonly SbiUsHolding[],
): SbiUsHolding[] {
  const previousById = new Map(previousInferred.map((holding) => [holding.id, holding]));
  const nextById = new Map(nextInferred.map((holding) => [holding.id, holding]));
  const previousIds = new Set(previousById.keys());
  const reconciled: SbiUsHolding[] = [];

  for (const holding of reviewed) {
    const previous = previousById.get(holding.id);
    if (holding.source === "inferred" && previous && sameHolding(holding, previous)) {
      const next = nextById.get(holding.id);
      if (next) reconciled.push(next);
      continue;
    }
    reconciled.push(holding);
  }

  const ids = new Set(reconciled.map((holding) => holding.id));
  const pairs = new Set(reconciled.map(holdingPair));
  for (const holding of nextInferred) {
    if (ids.has(holding.id) || pairs.has(holdingPair(holding))) continue;
    // 이전 추정 행이 확인 화면에서 삭제되었다면 새 가져오기에서도 되살리지 않는다.
    if (previousIds.has(holding.id)) continue;
    reconciled.push(holding);
  }

  return reconciled.sort((a, b) => a.ticker.localeCompare(b.ticker) || a.accountType.localeCompare(b.accountType));
}

export const inferredId = (ticker: string, accountType: string) =>
  `sbi-us:${encodeURIComponent(ticker.toUpperCase())}:${encodeURIComponent(accountType || "-")}`;

const clean = (value: number) => Number(value.toFixed(10));

function compareTrades(a: SbiUsTrade, b: SbiUsTrade): number {
  return a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker) || a.dedupeKey.localeCompare(b.dedupeKey);
}

function compareForAverage(a: SbiUsTrade, b: SbiUsTrade): number {
  return a.date.localeCompare(b.date) || a.dedupeKey.localeCompare(b.dedupeKey);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function holdingPair(holding: SbiUsHolding): string {
  return `${holding.ticker}\u0000${holding.accountType}`;
}

function sameHolding(a: SbiUsHolding, b: SbiUsHolding): boolean {
  return (
    a.id === b.id &&
    a.ticker === b.ticker &&
    a.name === b.name &&
    a.quantity === b.quantity &&
    a.avgCost === b.avgCost &&
    a.costCurrency === b.costCurrency &&
    a.accountType === b.accountType &&
    a.source === b.source
  );
}
