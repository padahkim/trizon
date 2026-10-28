import type { Holding } from "../portfolio/types";
import { decodeCsv, findColumn, parseAmount, parseCsv } from "./csv";

function accountOf(title: string): string {
  // Preserve nested tax-bucket details; old つみたてNISA and current NISA must differ.
  const bucket = title.match(/現物\/(.+)\)$/)?.[1];
  return (bucket ?? title).replaceAll("預り", "");
}

export function parsePortfolio(bytes: Uint8Array, now: Date): Holding[] {
  const holdings: Holding[] = [];
  let title = "";
  let header: string[] | null = null;
  let foundCashHeader = false;
  for (const { cells, line } of parseCsv(decodeCsv(bytes))) {
    if (cells.length <= 1) {
      if (cells.length === 1) title = cells[0];
      header = null;
      continue;
    }
    if (title.endsWith("合計")) continue;
    if (cells[0] === "銘柄(コード)") {
      if (findColumn(cells, "建単価") >= 0) {
        header = null;
        continue;
      }
      const missing = ["数量", "取得単価", "現在値"].filter((name) => findColumn(cells, name) < 0);
      if (missing.length) throw new Error(`${line}행: ${missing.join("·")} 머리글이 없습니다`);
      header = cells;
      foundCashHeader = true;
      continue;
    }
    if (!header) continue;
    const security = cells[0].match(/^([0-9A-Z]{4})\s+(.+)$/);
    if (!security) throw new Error(`${line}행: 종목 코드와 이름을 읽지 못했습니다`);
    const numberAt = (name: string, optional = false) => {
      const index = findColumn(header!, name);
      const parsed = parseAmount(cells[index] ?? "", line);
      if (!optional && (parsed === null || parsed.amount < 0)) throw new Error(`${line}행: ${name}을 읽지 못했습니다`);
      return parsed?.amount;
    };
    const price = numberAt("現在値", true);
    holdings.push({
      broker: "SBI", account: accountOf(title), market: "JP", code: security[1], name: security[2],
      quantity: numberAt("数量")!, avgCost: numberAt("取得単価")!,
      ...(price !== undefined ? { csvQuote: { price, asOf: now.toISOString() } } : {}),
    });
  }
  if (!foundCashHeader) throw new Error("일본주식 現物 표의 머리글을 찾지 못했습니다");
  return holdings;
}
