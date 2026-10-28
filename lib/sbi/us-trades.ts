import { z } from "zod";
import type { Holding } from "../portfolio/types";
import { decodeCsv, findColumn, parseAmount, parseCsv } from "./csv";

export const usTradeSchema = z.object({
  key: z.string(), tradeDate: z.iso.date(), ticker: z.string(), name: z.string(),
  side: z.enum(["buy", "sell"]), account: z.string(),
  quantity: z.number().finite().positive(), price: z.number().finite().nonnegative(),
  settlement: z.object({ amount: z.number().finite(), currency: z.enum(["JPY", "USD"]) }).optional(),
});
export type UsTrade = z.infer<typeof usTradeSchema>;

export const usHoldingBaselineSchema = z.object({
  ticker: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)*$/, "미국주식 종목 코드를 확인해 주세요."),
  name: z.string().trim().min(1, "종목명을 입력해 주세요."),
  account: z.string().trim().min(1, "계좌구분을 입력해 주세요."),
  asOf: z.iso.date("유효한 기준일을 입력해 주세요."),
  quantity: z.number("0 이상의 보유수량을 입력해 주세요.").finite().nonnegative("0 이상의 보유수량을 입력해 주세요."),
  avgCost: z.number("0 이상의 달러 취득단가를 입력해 주세요.").finite().nonnegative("0 이상의 달러 취득단가를 입력해 주세요."),
}).transform((baseline) => baseline.quantity === 0 ? { ...baseline, avgCost: 0 } : baseline);
export type UsHoldingBaseline = z.infer<typeof usHoldingBaselineSchema>;
export type UsPosition = Pick<UsTrade, "ticker" | "name" | "account">;
export type UsHoldingIssue = UsPosition & { message: string };

export function usPositionKey(position: Pick<UsPosition, "ticker" | "account">): string {
  return JSON.stringify([position.ticker, position.account]);
}

const requiredColumns = ["国内約定日", "銘柄", "銘柄コード", "商品区分", "取引", "預り区分", "約定数量", "約定単価"];

function parseDate(value: string, line: number): string {
  const match = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  const date = match && `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  if (!date || !z.iso.date().safeParse(date).success) throw new Error(`${line}행: 날짜를 읽지 못했습니다`);
  return date;
}

export function parseUsTrades(bytes: Uint8Array): { trades: UsTrade[]; notices: string[] } {
  const rows = parseCsv(decodeCsv(bytes));
  const headerIndex = rows.findIndex(({ cells }) => cells[0] === "国内約定日");
  if (headerIndex < 0) throw new Error("約定履歴 표의 머리글을 찾지 못했습니다");
  const header = rows[headerIndex];
  const missing = requiredColumns.filter((name) => findColumn(header.cells, name) < 0);
  if (missing.length) throw new Error(`${header.line}행: ${missing.join("·")} 머리글이 없습니다`);
  const trades: UsTrade[] = [];
  const occurrences = new Map<string, number>();
  let skipped = 0;
  let rowCount = 0;
  for (const { cells, line } of rows.slice(headerIndex + 1)) {
    if (!cells.length) continue;
    rowCount++;
    const cell = (name: string) => cells[findColumn(header.cells, name)] ?? "";
    const side = cell("取引") === "現買" ? "buy" : cell("取引") === "現売" ? "sell" : null;
    if (cell("商品区分") !== "米国株式" || side === null) { skipped++; continue; }
    const tradeDate = parseDate(cell("国内約定日"), line);
    const ticker = cell("銘柄コード").toUpperCase();
    const name = cell("銘柄");
    const account = cell("預り区分");
    if (!/^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)*$/.test(ticker) || !name || !account) {
      throw new Error(`${line}행: 종목 코드·이름·預り区分을 읽지 못했습니다`);
    }
    const quantity = parseAmount(cell("約定数量"), line);
    const price = parseAmount(cell("約定単価"), line);
    if (!quantity || quantity.amount <= 0 || quantity.currency || !price || price.amount < 0 || (price.currency && price.currency !== "USD")) {
      throw new Error(`${line}행: 約定数量·約定単価(USD)를 읽지 못했습니다`);
    }
    const settled = parseAmount(cell("受渡金額/決済損益").replace(/円$/, "JPY"), line);
    if (settled && settled.currency !== "USD" && settled.currency !== "JPY") {
      throw new Error(`${line}행: 受渡金額의 통화(USD·JPY)를 읽지 못했습니다`);
    }
    const settlement = settled ? { amount: settled.amount, currency: settled.currency as "USD" | "JPY" } : undefined;
    const settlementDate = cell("国内受渡日") ? parseDate(cell("国内受渡日"), line) : "";
    const baseKey = JSON.stringify([tradeDate, ticker, side, account, quantity.amount, price.amount, settlementDate, settlement ?? null]);
    const occurrence = (occurrences.get(baseKey) ?? 0) + 1;
    occurrences.set(baseKey, occurrence);
    trades.push({ key: `${baseKey}#${occurrence}`, tradeDate, ticker, name, side, account, quantity: quantity.amount, price: price.amount, ...(settlement ? { settlement } : {}) });
  }
  const notices: string[] = [];
  if (skipped) notices.push(`건너뛴 거래 ${skipped}건`);
  if (rowCount >= 1000) notices.push("1,000건 한도에 닿았습니다. SBI에서 기간을 나눠 CSV를 다시 받아 올려 주세요.");
  return { trades, notices };
}

/** Keys include the occurrence within each export, retaining identical fills in one file. */
export function mergeTrades(stored: UsTrade[], incoming: UsTrade[]): UsTrade[] {
  const trades = new Map(stored.map((trade) => [trade.key, trade]));
  for (const trade of incoming) if (!trades.has(trade.key)) trades.set(trade.key, trade);
  return [...trades.values()];
}

export function holdingsFromTrades(trades: UsTrade[], baselines: UsHoldingBaseline[] = []): { holdings: Holding[]; notices: string[]; issues: UsHoldingIssue[] } {
  const groups = new Map<string, UsTrade[]>();
  const baselineByPosition = new Map(baselines.map((baseline) => [usPositionKey(baseline), baseline]));
  for (const key of baselineByPosition.keys()) groups.set(key, []);
  for (const trade of trades) {
    const key = usPositionKey(trade);
    const group = groups.get(key) ?? [];
    group.push(trade);
    groups.set(key, group);
  }
  const holdings: Holding[] = [];
  const notices: string[] = [];
  const issues: UsHoldingIssue[] = [];
  for (const [key, group] of groups) {
    const baseline = baselineByPosition.get(key);
    const ordered = group.filter((trade) => !baseline || trade.tradeDate > baseline.asOf)
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || Number(a.side === "sell") - Number(b.side === "sell"));
    let quantity = baseline?.quantity ?? 0;
    let cost = quantity * (baseline?.avgCost ?? 0);
    let oversold = false;
    for (const trade of ordered) {
      if (trade.side === "buy") {
        quantity += trade.quantity;
        cost += trade.settlement?.currency === "USD" ? trade.settlement.amount : trade.quantity * trade.price;
      } else {
        if (trade.quantity > quantity + 1e-9) { oversold = true; break; }
        cost -= cost / quantity * trade.quantity;
        quantity -= trade.quantity;
        if (Math.abs(quantity) < 1e-9) { quantity = 0; cost = 0; }
      }
    }
    const last = baseline ?? ordered.at(-1)!;
    if (oversold) {
      const message = baseline ? "계산할 수 없음: 기준 보유정보 이후 매도가 보유수량을 넘었습니다. 기준값과 CSV를 확인해 주세요." : "계산할 수 없음: 2년 이전 매수분 필요";
      notices.push(`${last.name} (${last.ticker} · ${last.account}): ${message}`);
      issues.push({ ticker: last.ticker, name: last.name, account: last.account, message });
      continue;
    }
    if (quantity === 0) continue;
    holdings.push({ broker: "SBI", market: "US", code: last.ticker, name: last.name, account: last.account, quantity, avgCost: cost / quantity });
  }
  return { holdings, notices, issues };
}
