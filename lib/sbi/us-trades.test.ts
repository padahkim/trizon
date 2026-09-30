import { test } from "node:test";
import assert from "node:assert/strict";
import { US_TRADES_CSV } from "./fixtures.ts";
import { parseUsTrades } from "./parse.ts";
import type { SbiUsHolding } from "./types.ts";
import { inferUsHoldings, mergeUsTrades, reconcileReviewedUsHoldings } from "./us-trades.ts";

const parsed = () => parseUsTrades(US_TRADES_CSV);

test("여러 약정이력의 겹치는 체결을 제거하되 파일 안의 동일 체결은 보존한다", () => {
  const merged = mergeUsTrades([parsed(), parsed()]);
  assert.equal(merged.trades.length, 8);
  assert.equal(merged.duplicateCount, 8);
  assert.equal(merged.trades.filter((trade) => trade.ticker === "VST").length, 2);
  assert.ok(merged.warnings.some((warning) => warning.includes("같은 체결 8건")));
  assert.ok(merged.warnings.some((warning) => warning.includes("최근 2년")));
});

test("잔량만 이동평균 취득단가로 남기고 전량 매도·초과 매도는 평가 잔고에서 뺀다", () => {
  const result = inferUsHoldings(mergeUsTrades([parsed()]).trades);
  assert.deepEqual(
    result.holdings.map((holding) => [holding.ticker, holding.accountType, holding.quantity, holding.avgCost]),
    [
      ["NVDA", "特定", 15, 150],
      ["VST", "NISA", 2, 141.63],
    ],
  );
  assert.equal(result.closedCount, 1, "MSFT는 전량 매도되어 제외");
  assert.ok(!result.holdings.some((holding) => holding.ticker === "OLD"));
  assert.ok(result.warnings.some((warning) => warning.includes("OLD") && warning.includes("매도수량")));
});

test("새 CSV를 합칠 때 손대지 않은 추정값만 갱신하고 수정·추가·삭제한 잔고는 보존한다", () => {
  const holding = (ticker: string, quantity: number): SbiUsHolding => ({
    id: `sbi-us:${ticker}:特定`,
    ticker,
    name: ticker,
    quantity,
    avgCost: 100,
    costCurrency: "USD",
    accountType: "特定",
    source: "inferred",
  });
  const previous = [holding("NVDA", 10), holding("VST", 2), holding("MSFT", 1)];
  const correctedNvda = { ...previous[0], quantity: 12, avgCost: 15_000, costCurrency: "JPY" as const };
  const reviewed: SbiUsHolding[] = [
    correctedNvda,
    previous[2],
    { ...holding("AAPL", 3), id: "manual-aapl", source: "manual" },
  ];
  const next = [holding("NVDA", 15), holding("VST", 2), holding("MSFT", 4), holding("GOOG", 1)];

  const reconciled = reconcileReviewedUsHoldings(previous, next, reviewed);
  assert.deepEqual(
    reconciled.map((row) => [row.ticker, row.quantity, row.avgCost, row.costCurrency, row.source]),
    [
      ["AAPL", 3, 100, "USD", "manual"],
      ["GOOG", 1, 100, "USD", "inferred"],
      ["MSFT", 4, 100, "USD", "inferred"],
      ["NVDA", 12, 15_000, "JPY", "inferred"],
    ],
  );
  assert.ok(!reconciled.some((row) => row.ticker === "VST"), "사용자가 삭제한 기존 추정 행을 되살리지 않는다");
});
