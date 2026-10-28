import type { Holding } from "../portfolio/types";
import { decodeCsv, findColumn, parseAmount, parseCsv } from "./csv";

function accountOf(title: string): string {
  // Preserve nested tax-bucket details; old つみたてNISA and current NISA must differ.
  const bucket = title.match(/現物\/(.+)\)$/)?.[1];
  return (bucket ?? title).replaceAll("預り", "");
}

function extractCount(cell: string): number | null {
  const match = cell.match(/^(?:総件数\s*[:：]\s*)?(\d+)件$/);
  return match ? Number(match[1]) : null;
}

function extractRange(cell: string): [number, number] | null {
  const match = cell.match(/^(?:選択範囲\s*[:：]\s*)?(\d+)\s*[-–~]\s*(\d+)件$/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function parsePortfolio(bytes: Uint8Array, now: Date): { holdings: Holding[]; notices: string[] } {
  const holdings: Holding[] = [];
  const notices: string[] = [];
  let title = "";
  let header: string[] | null = null;
  let foundCashHeader = false;
  let skippedTables = 0;
  let declaredCount: number | null = null;
  let selectedRange: [number, number] | null = null;

  for (const { cells, line } of parseCsv(decodeCsv(bytes))) {
    if (cells.length <= 1) {
      if (cells.length === 1) {
        const text = cells[0];
        const count = text.startsWith("総件数") ? extractCount(text) : null;
        const range = text.startsWith("選択範囲") ? extractRange(text) : null;
        if (count !== null) {
          declaredCount = count;
        } else if (range !== null) {
          selectedRange = range;
        } else {
          title = text;
        }
      }
      header = null;
      continue;
    }
    if (cells[0] === "総件数" && cells[1]) {
      const count = extractCount(cells[1]);
      if (count !== null) declaredCount = count;
    }
    if (cells[0] === "選択範囲" && cells[1]) {
      const range = extractRange(cells[1]);
      if (range !== null) selectedRange = range;
    }
    if (title.endsWith("合計")) continue;

    if (cells[0] === "銘柄(コード)") {
      if (findColumn(cells, "建単価") >= 0) {
        skippedTables++;
        header = null;
        continue;
      }
      const missing = ["数量", "取得単価", "現在値"].filter((name) => findColumn(cells, name) < 0);
      if (missing.length) throw new Error(`${line}행: ${missing.join("·")} 머리글이 없습니다`);
      header = cells;
      foundCashHeader = true;
      continue;
    }

    if (cells[0] === "ファンド名") {
      skippedTables++;
      header = null;
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

  if (!foundCashHeader && skippedTables === 0) throw new Error("일본주식 現物 표의 머리글을 찾지 못했습니다");

  if (skippedTables > 0) {
    notices.push(`건너뛴 표 ${skippedTables}개`);
  }
  if (declaredCount !== null && selectedRange !== null && declaredCount > selectedRange[1]) {
    notices.push(`총 ${declaredCount}건 중 ${selectedRange[0]}–${selectedRange[1]}건만 들어 있습니다. SBI 화면에서 전체가 보이도록 한 뒤 다시 받아 올려 주세요.`);
  }

  return { holdings, notices };
}
