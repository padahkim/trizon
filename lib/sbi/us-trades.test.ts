import { test } from "node:test";
import assert from "node:assert/strict";
import { US_TRADES_CSV } from "./fixtures.ts";
import { parseUsTrades } from "./parse.ts";
import { inferUsHoldings, mergeUsTrades } from "./us-trades.ts";

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
