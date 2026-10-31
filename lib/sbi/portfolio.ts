import type { Holding } from "../portfolio/types";
import { decodeCsv, findColumn, parseAmount, parseCsv } from "./csv";

function accountOf(title: string): string {
  // Preserve nested tax-bucket details; old つみたてNISA and current NISA must differ.
  const bucket = title.match(/(?:現物|金額|口数)\/(.+)\)$/)?.[1]
    ?? title.match(/^投資信託\((.+)\)$/)?.[1];
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
  let isFund = false;
  let foundHoldingsHeader = false;
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

    if (cells[0] === "銘柄(コード)" && findColumn(cells, "建単価") >= 0) {
      skippedTables++;
      header = null;
      continue;
    }

    if (cells[0] === "銘柄(コード)" || cells[0] === "ファンド名") {
      const missing = ["数量", "取得単価", "現在値"].filter((name) => findColumn(cells, name) < 0);
      if (missing.length) throw new Error(`${line}행: ${missing.join("·")} 머리글이 없습니다`);
      header = cells;
      isFund = cells[0] === "ファンド名";
      foundHoldingsHeader = true;
      continue;
    }

    if (!header) continue;

    const stock = cells[0].match(/^([0-9A-Z]{4})\s+(.+)$/);
    if (!cells[0] || (!isFund && !stock)) throw new Error(`${line}행: 종목 코드와 이름을 읽지 못했습니다`);
    const code = isFund ? cells[0] : stock![1];
    const name = isFund ? cells[0] : stock![2];
    const numberAt = (name: string, optional = false) => {
      const index = findColumn(header!, name);
      const value = cells[index] ?? "";
      const parsed = parseAmount(isFund && name === "数量" ? value.replace(/口$/, "") : value, line);
      if (!optional && (parsed === null || parsed.amount < 0)) throw new Error(`${line}행: ${name}을 읽지 못했습니다`);
      return parsed?.amount;
    };
    const price = numberAt("現在値", true);
    const quantity = numberAt("数量")!;
    const priceChange = isFund ? numberAt("前日比", true) : undefined;
    holdings.push({
      broker: "SBI", account: accountOf(title), market: "JP", code, name,
      ...(isFund ? { assetType: "fund" as const } : {}),
      quantity, avgCost: numberAt("取得単価")!,
      ...(price !== undefined ? { csvQuote: { price, asOf: now.toISOString() } } : {}),
      ...(isFund ? { csvValuation: {
        value: numberAt("評価額", true), pnl: numberAt("損益", true),
        dayChange: priceChange === undefined ? undefined : priceChange * quantity / 10000,
      } } : {}),
    });
  }

  if (!foundHoldingsHeader && skippedTables === 0) throw new Error("일본주식 現物·투자신탁 표의 머리글을 찾지 못했습니다");

  if (skippedTables > 0) {
    notices.push(`건너뛴 표 ${skippedTables}개`);
  }
  if (
    declaredCount !== null &&
    selectedRange !== null &&
    (selectedRange[1] - selectedRange[0] + 1 < declaredCount || selectedRange[0] > 1 || selectedRange[1] < declaredCount)
  ) {
    notices.push(`총 ${declaredCount}건 중 ${selectedRange[0]}–${selectedRange[1]}건만 들어 있습니다. SBI 화면에서 전체가 보이도록 한 뒤 다시 받아 올려 주세요.`);
  }

  return { holdings, notices };
}
