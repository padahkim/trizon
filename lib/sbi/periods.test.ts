import { test } from "node:test";
import assert from "node:assert/strict";
import { sbiPeriodIssue } from "./periods.ts";
import type { Period, SbiDividends, SbiRealized } from "./types.ts";

const period: Period = { from: "2024-01-01", to: "2026-09-28" };
const realized = (value: Period | null): SbiRealized => ({
  period: value,
  beforeTax: true,
  rows: [],
  total: { product: "合計", pnl: 0, profit: null, loss: null },
});
const dividends = (value: Period | null): SbiDividends => ({ period: value, byProduct: [], totalJpy: 0, items: [] });

test("실현손익과 배당 CSV가 모두 있어야 기간을 비교한다", () => {
  assert.equal(sbiPeriodIssue(realized(period), null), null);
  assert.equal(sbiPeriodIssue(null, dividends(period)), null);
});

test("기간이 없거나 서로 다르면 누적손익 기간 문제를 알린다", () => {
  assert.equal(sbiPeriodIssue(realized(null), dividends(period))?.kind, "unknown");
  assert.equal(sbiPeriodIssue(realized(period), dividends(null))?.kind, "unknown");
  assert.equal(sbiPeriodIssue(realized(period), dividends({ ...period, to: "2026-09-27" }))?.kind, "different");
  assert.equal(sbiPeriodIssue(realized(period), dividends(period)), null);
});
