import { decodeCsv, findColumn, parseCsv } from "./csv";

export function detectSbiKind(bytes: Uint8Array): "portfolio" | "usTrades" | null {
  for (const { cells } of parseCsv(decodeCsv(bytes))) {
    if (cells[0] === "ポートフォリオ一覧" || (cells[0] === "銘柄(コード)" && findColumn(cells, "取得単価") >= 0)) return "portfolio";
    if (cells[0] === "約定履歴" || (cells[0] === "国内約定日" && findColumn(cells, "銘柄コード") >= 0)) return "usTrades";
  }
  return null;
}
