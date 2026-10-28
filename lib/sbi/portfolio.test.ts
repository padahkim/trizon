import { expect, it } from "vitest";
import { parsePortfolio } from "./portfolio";
import { portfolioShiftJis, portfolioUtf8 } from "./fixtures";

it.each([portfolioUtf8, portfolioShiftJis])("reads only cash holdings, preserving the PRD quantities and costs and excluding totals", (bytes) => {
  expect(parsePortfolio(bytes, new Date("2026-10-28T00:00:00Z"))).toEqual({
    holdings: [
      { broker: "SBI", account: "特定", market: "JP", code: "1111", name: "JP-A", quantity: 10, avgCost: 1000, csvQuote: { price: 1200, asOf: "2026-10-28T00:00:00.000Z" } },
      { broker: "SBI", account: "特定", market: "JP", code: "999A", name: "JP-B", quantity: 10, avgCost: 900, csvQuote: { price: 800, asOf: "2026-10-28T00:00:00.000Z" } },
    ],
    notices: [],
  });
});

it("keeps the same code in separate accounts, finds named columns, and excludes margin, funds and total blocks (U13)", () => {
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
  const result = parsePortfolio(bytes, new Date("2026-10-28T00:00:00Z"));
  expect(result.holdings.map(({ account, code, quantity, avgCost }) => ({ account, code, quantity, avgCost }))).toEqual([
    { account: "特定", code: "1111", quantity: 10, avgCost: 1000 },
    { account: "NISA(成長投資枠)", code: "1111", quantity: 10, avgCost: 1000 },
    { account: "NISA(つみたて投資枠)", code: "999A", quantity: 10, avgCost: 900 },
  ]);
  expect(result.notices).toEqual(["건너뛴 표 2개"]);
});

it("does not merge legacy and current NISA account buckets for the same security", () => {
  const sections = ["つみたてNISA預り", "NISA預り(つみたて投資枠)", "旧NISA預り", "NISA預り(成長投資枠)"];
  const bytes = new TextEncoder().encode("ポートフォリオ一覧\n" + sections.map((account) => `株式(現物/${account})\n銘柄(コード),数量,取得単価,現在値\n1111 JP-A,10,1000,1200`).join("\n"));
  const accounts = parsePortfolio(bytes, new Date("2026-10-28T00:00:00Z")).holdings.map((holding) => holding.account);
  expect(new Set(accounts).size).toBe(4);
});

it("accepts a 0-row cash holdings table without failing (U45)", () => {
  const bytes = new TextEncoder().encode(`ポートフォリオ一覧
株式(現物/特定預り)
銘柄(コード),数量,取得単価,現在値
株式(現物/特定預り)合計
評価額,含み損益
0,0
`);
  const result = parsePortfolio(bytes, new Date("2026-10-28T00:00:00Z"));
  expect(result.holdings).toEqual([]);
  expect(result.notices).toEqual([]);
});

it("warns when the export is truncated (総件数 > 選択範囲)", () => {
  const bytes = new TextEncoder().encode(`ポートフォリオ一覧
総件数：40件
選択範囲：1-5件
株式(現物/特定預り)
銘柄(コード),数量,取得単価,現在値
1111 JP-A,10,1000,1200
`);
  const result = parsePortfolio(bytes, new Date("2026-10-28T00:00:00Z"));
  expect(result.holdings).toHaveLength(1);
  expect(result.notices).toEqual([
    "총 40건 중 1–5건만 들어 있습니다. SBI 화면에서 전체가 보이도록 한 뒤 다시 받아 올려 주세요.",
  ]);
});
