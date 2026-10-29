import { usPositionKey, type UsHoldingBaseline, type UsPosition, type UsTrade } from "../lib/sbi/us-trades";

type MissingJpyReason = "usd-baseline" | "usd-settlement" | "missing-settlement" | "negative-jpy-settlement";
export type JpyCostPosition = UsPosition & {
  quantity: number;
  cost: { status: "complete"; amount: number }
    | { status: "partial"; knownAmount: number; reasons: MissingJpyReason[] }
    | { status: "unknown"; reasons: MissingJpyReason[] };
};

/** Research model for #56; deliberately not connected to product holdings or storage. */
export function analyzeSbiJpyCost(trades: UsTrade[], baselines: UsHoldingBaseline[] = []): { positions: JpyCostPosition[]; issues: (UsPosition & { reason: "oversold" })[] } {
  const groups = new Map<string, UsTrade[]>();
  const baselineByPosition = new Map(baselines.map((baseline) => [usPositionKey(baseline), baseline]));
  for (const key of baselineByPosition.keys()) groups.set(key, []);
  for (const trade of trades) {
    const key = usPositionKey(trade);
    const group = groups.get(key) ?? [];
    group.push(trade);
    groups.set(key, group);
  }
  const positions: JpyCostPosition[] = [];
  const issues: (UsPosition & { reason: "oversold" })[] = [];
  for (const [key, group] of groups) {
    const baseline = baselineByPosition.get(key);
    const included = baseline?.includedTradeKeys && new Set(baseline.includedTradeKeys);
    let quantity = baseline?.quantity ?? 0;
    let cost = 0;
    let hasJpyEvidence = false;
    const reasons = new Set<MissingJpyReason>();
    if (quantity > 0) reasons.add("usd-baseline");
    let oversold = false;
    const ordered = group.filter((trade) => !baseline || (included ? !included.has(trade.key) : trade.tradeDate > baseline.asOf!))
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || Number(a.side === "sell") - Number(b.side === "sell"));
    for (const trade of ordered) {
      if (trade.side === "sell") {
        if (quantity === 0 || trade.quantity > quantity + 1e-9) { oversold = true; break; }
        cost *= 1 - trade.quantity / quantity;
        quantity -= trade.quantity;
        if (Math.abs(quantity) < 1e-9) {
          quantity = 0;
          cost = 0;
          hasJpyEvidence = false;
          reasons.clear();
        }
      } else {
        quantity += trade.quantity;
        if (!trade.settlement) reasons.add("missing-settlement");
        else if (trade.settlement.currency === "USD") reasons.add("usd-settlement");
        else if (trade.settlement.amount < 0) reasons.add("negative-jpy-settlement");
        else { cost += trade.settlement.amount; hasJpyEvidence = true; }
      }
    }
    const { ticker, name, account } = baseline ?? group[0];
    if (oversold) {
      issues.push({ ticker, name, account, reason: "oversold" });
      continue;
    }
    positions.push({ ticker, name, account, quantity, cost: reasons.size
      ? hasJpyEvidence ? { status: "partial", knownAmount: cost, reasons: [...reasons] } : { status: "unknown", reasons: [...reasons] }
      : { status: "complete", amount: cost } });
  }
  return { positions, issues };
}
