import { test } from "node:test";
import assert from "node:assert/strict";
import { DIVIDENDS_CSV, PORTFOLIO_CSV, REALIZED_CSV, US_TRADES_CSV } from "./fixtures.ts";
import { accountTypeOf, detectKind, fundUnitSize, parseDividends, parseImports, parsePortfolio, parseRealized, parseUsTrades } from "./parse.ts";
import type { Parsed } from "./types.ts";

function ok<T>(r: Parsed<T>): { data: T; warnings: string[] } {
  if (!r.ok) assert.fail(r.error);
  return r;
}

test("내용으로 종류를 가린다", () => {
  assert.equal(detectKind(REALIZED_CSV), "realized");
  assert.equal(detectKind(PORTFOLIO_CSV), "portfolio");
  assert.equal(detectKind(DIVIDENDS_CSV), "dividends");
  assert.equal(detectKind(US_TRADES_CSV), "usTrades");
  assert.equal(detectKind('"날짜","금액"\n"2026/1/1","100"\n'), null);
});

test("米国株式 約定履歴: 필수 열·기간·현물 매수/매도·결제금액과 수수료 추정", () => {
  const { data, warnings } = ok(parseUsTrades(US_TRADES_CSV));
  assert.deepEqual(data.period, { from: "2024-09-30", to: "2026-09-29" });
  assert.equal(data.sourceRowCount, 8);
  assert.equal(data.trades.length, 8);
  assert.deepEqual(warnings, []);

  const sale = data.trades.find((trade) => trade.ticker === "NVDA" && trade.side === "sell");
  assert.deepEqual(sale, {
    dedupeKey: "2026-09-28|NVDA|sell|5|150|特定|2026/09/30|749#1",
    tradeId: null,
    date: "2026-09-28",
    settlementDate: "2026-09-30",
    ticker: "NVDA",
    name: "エヌビディア",
    market: "NASDAQ",
    side: "sell",
    accountType: "特定",
    quantity: 5,
    unitPrice: 150,
    priceCurrency: "USD",
    settlementAmount: 749,
    settlementCurrency: "USD",
    estimatedFee: 1,
  });

  const vstra = data.trades.filter((trade) => trade.ticker === "VST");
  assert.equal(vstra.length, 2);
  assert.equal(new Set(vstra.map((trade) => trade.dedupeKey)).size, 2, "같은 파일의 동일한 두 체결은 보존한다");
  assert.equal(parseUsTrades(US_TRADES_CSV.replace('"約定数量"', '"数量"')).ok, false);
});

test("実現損益: 기간·상품별·合計, 세전 여부", () => {
  const { data, warnings } = ok(parseRealized(REALIZED_CSV));
  assert.deepEqual(data.period, { from: "2024-01-01", to: "2026-09-28" });
  assert.equal(data.beforeTax, true);
  assert.deepEqual(data.rows.map((r) => [r.product, r.pnl]), [["国内株式(現物)", 12_000], ["米国株式", -3_500], ["投資信託", 500]]);
  assert.deepEqual(data.total, { product: "合計", pnl: 9_000, profit: 22_000, loss: -13_000 });
  assert.deepEqual(warnings, []);
});

test("実現損益: 合計가 상품별 합과 다르면 알린다", () => {
  const { data, warnings } = ok(parseRealized(REALIZED_CSV.replace('"合計","+9,000"', '"合計","+9,999"')));
  assert.equal(data.total.pnl, 9_999);
  assert.equal(warnings.length, 1);
});

test("実現損益: 다른 CSV 는 오류", () => {
  assert.equal(parseRealized(DIVIDENDS_CSV).ok, false);
});

test("ポートフォリオ: 預り 구분별 현물·신용·투자신탁", () => {
  const { data, warnings } = ok(parsePortfolio(PORTFOLIO_CSV));
  assert.deepEqual(warnings, []);
  assert.equal(data.holdingsComplete, true);
  assert.deepEqual(
    data.stocks.map((s) => [s.accountType, s.code, s.name, s.quantity, s.unitCost, s.boughtAt]),
    [
      ["特定", "7203", "トヨタ", 100, 2_500, null],
      ["NISA成長", "7203", "トヨタ", 50, 2_600, "2026-01-05"],
      ["NISA成長", "285A", "キオクシア", 10, 3_000, "2026-02-10"],
    ],
  );
  assert.deepEqual(data.margins, [
    {
      code: "6758",
      name: "ソニーG",
      side: "buy",
      market: "東証",
      term: "無期限",
      openedAt: "2026-07-01",
      quantity: 100,
      openPrice: 3_000,
      price: 3_200,
      pnl: 19_000,
      notional: 300_000,
    },
  ]);
  assert.equal(data.funds.length, 1);
  const fund = data.funds[0];
  assert.equal(fund.name, "test 全世界株式インデックス(為替ヘッジなし)");
  assert.equal(fund.accountType, "NISAつみたて");
  assert.equal(fund.unitSize, 10_000);
  assert.deepEqual(data.csvTotal, { value: 947_000, marginNotional: 300_000, pnl: 156_000 });
});

test("ポートフォリオ: 읽지 못한 표·빠진 행·잘린 페이지를 알린다", () => {
  const withForeign = PORTFOLIO_CSV.replace(
    '"総合計",',
    `"外貨建MMF",
"ファンド名","数量","評価額(円)",
"ドルMMF",1000,150000,
"総合計",`,
  );
  const r1 = ok(parsePortfolio(withForeign));
  assert.ok(r1.warnings.some((w) => w.includes("外貨建MMF")), r1.warnings.join("\n"));
  assert.equal(r1.data.holdingsComplete, false);

  const brokenRow = ok(parsePortfolio(PORTFOLIO_CSV.replace('"285A キオクシア"', '"キオクシア"')));
  assert.equal(brokenRow.data.stocks.length, 2);
  assert.equal(brokenRow.data.holdingsComplete, false);
  assert.ok(brokenRow.warnings.some((w) => w.startsWith("읽지 못한 행")));
  assert.ok(brokenRow.warnings.some((w) => w.includes("CSV 합계")));

  const paged = ok(parsePortfolio(PORTFOLIO_CSV.replace("総件数：5件", "総件数：40件")));
  assert.equal(paged.data.holdingsComplete, false);
  assert.ok(paged.warnings.some((w) => w.includes("40건 중 1–5건")), paged.warnings.join("\n"));
});

test("ポートフォリオ: 정상적인 빈 목록은 스냅샷을 막을 불완전 파싱이 아니다", () => {
  const empty = ok(parsePortfolio('"ポートフォリオ一覧",\n"総件数：0件",\n'));
  assert.equal(empty.data.holdingsComplete, true);
  assert.deepEqual(empty.warnings, ["보유종목이 없습니다"]);
});

test("ポートフォリオ: 보유종목 표가 전혀 없으면 오류", () => {
  assert.equal(parsePortfolio(REALIZED_CSV).ok, false);
});

test("預り 구분 / 투자신탁 기준가 단위", () => {
  assert.equal(accountTypeOf("株式(現物/特定預り)"), "特定");
  assert.equal(accountTypeOf("株式(現物/NISA預り(成長投資枠))"), "NISA成長");
  assert.equal(accountTypeOf("投資信託(金額/NISA預り(つみたて投資枠))"), "NISAつみたて");
  assert.equal(accountTypeOf("株式(信用)"), "信用");
  assert.equal(fundUnitSize(246_432, 45_049, 1_110_151.51), 10_000);
  assert.equal(fundUnitSize(10, 1_500, 15_000), 1);
  assert.equal(fundUnitSize(10, null, null), 10_000);
});

test("配当・分配金: 商品별 합계와 건별 목록", () => {
  const { data, warnings } = ok(parseDividends(DIVIDENDS_CSV));
  assert.deepEqual(warnings, []);
  assert.deepEqual(data.period, { from: "2024-01-01", to: "2026-09-28" });
  assert.equal(data.totalJpy, 3_845.6);
  assert.deepEqual(data.byProduct, [
    { product: "国内株式(現物)", amountJpy: 1_500, amountUsd: null },
    { product: "米国株式", amountJpy: 2_345.6, amountUsd: 15.5 },
  ]);
  assert.equal(data.items.length, 3);
  assert.deepEqual(data.items[1], {
    date: "2026-06-30",
    account: "NISA(成長投資枠)",
    product: "国内株式(現物)",
    name: "トヨタ自動車 7203",
    quantity: 50,
    amountJpy: 1_000,
  });
});

test("配当・分配金: 검색 건수와 읽은 건수가 다르면 알린다", () => {
  const { warnings } = ok(parseDividends(DIVIDENDS_CSV.replace('"検索件数","3"', '"検索件数","4"')));
  assert.ok(warnings.some((w) => w.includes("4건 중 3건")));
});

test("저장된 원문을 다시 파싱하고, 기준 시각은 파일 수정 시각", () => {
  const loaded = parseImports({
    realized: { fileName: "a.csv", fileModifiedAt: "2026-09-27T15:00:00.000Z", importedAt: "2026-09-28T00:00:00.000Z", text: REALIZED_CSV },
    portfolio: { fileName: "b.csv", fileModifiedAt: null, importedAt: "2026-09-28T00:00:00.000Z", text: "깨진 내용" },
  });
  assert.equal(loaded.realized?.asOf, "2026-09-27T15:00:00.000Z");
  assert.equal(loaded.realized?.parsed.ok, true);
  assert.equal(loaded.portfolio?.asOf, "2026-09-28T00:00:00.000Z");
  assert.equal(loaded.portfolio?.parsed.ok, false);
  assert.equal(loaded.dividends, null);
});
