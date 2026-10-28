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
  for (const { cells, line } of parseCsv(decodeCsv(bytes))) {
    if (cells.length <= 1) {
      if (cells.length === 1) title = cells[0];
      header = null;
      continue;
    }
    if (title.endsWith("合計")) continue;
    if (cells[0] === "銘柄(コード)") {
      header = findColumn(cells, "取得単価") >= 0 && findColumn(cells, "建単価") < 0 ? cells : null;
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
  return holdings;
}
