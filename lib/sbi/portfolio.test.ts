import { expect, it } from "vitest";
import { parsePortfolio } from "./portfolio";
import { portfolioShiftJis, portfolioUtf8 } from "./fixtures";

it.each([portfolioUtf8, portfolioShiftJis])("reads only cash holdings, preserving the PRD quantities and costs and excluding totals", (bytes) => {
  expect(parsePortfolio(bytes, new Date("2026-10-28T00:00:00Z"))).toEqual([
    { broker: "SBI", account: "特定", market: "JP", code: "1111", name: "JP-A", quantity: 10, avgCost: 1000, csvQuote: { price: 1200, asOf: "2026-10-28T00:00:00.000Z" } },
    { broker: "SBI", account: "特定", market: "JP", code: "999A", name: "JP-B", quantity: 10, avgCost: 900, csvQuote: { price: 800, asOf: "2026-10-28T00:00:00.000Z" } },
  ]);
});

it("keeps the same code in separate accounts, finds named columns, and excludes margin, funds and total blocks", () => {
  const bytes = new TextEncoder().encode(`ポートフォリオ一覧
株式(現物/特定預り)
銘柄(コード),現在値(円),取得単価(円),数量(株)
1111 JP-A,1200,1000,10
株式(現物/NISA預り(成長投資枠))
銘柄(コード),現在値,取得単価,数量
1111 JP-A,1200,1000,10
株式(現物/NISA預り(つみたて投資枠))
銘柄(コード),現在値,取得単価,数量
999A JP-B,800,900,10
株式(信用)
銘柄(コード),数量,建単価,現在値
1111 JP-A,10,1000,1200
投資信託
ファンド名,数量,取得単価,現在値
架空ファンド,10,1000,1200
総合計
銘柄(コード),数量,取得単価,現在値
1111 JP-A,99,1000,1200
`);
  expect(parsePortfolio(bytes, new Date("2026-10-28T00:00:00Z")).map(({ account, code, quantity, avgCost }) => ({ account, code, quantity, avgCost }))).toEqual([
    { account: "特定", code: "1111", quantity: 10, avgCost: 1000 },
    { account: "NISA(成長投資枠)", code: "1111", quantity: 10, avgCost: 1000 },
    { account: "NISA(つみたて投資枠)", code: "999A", quantity: 10, avgCost: 900 },
  ]);
});

it("does not merge legacy and current NISA account buckets for the same security", () => {
  const sections = ["つみたてNISA預り", "NISA預り(つみたて投資枠)", "旧NISA預り", "NISA預り(成長投資枠)"];
  const bytes = new TextEncoder().encode("ポートフォリオ一覧\n" + sections.map((account) => `株式(現物/${account})\n銘柄(コード),数量,取得単価,現在値\n1111 JP-A,10,1000,1200`).join("\n"));
  const accounts = parsePortfolio(bytes, new Date("2026-10-28T00:00:00Z")).map((holding) => holding.account);
  expect(new Set(accounts).size).toBe(4);
});
