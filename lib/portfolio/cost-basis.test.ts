import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultCostBasisMode, impliedFxRate, isFxRateSuspicious, resolveCostBasisHome, scaleCostBasis } from "./cost-basis.ts";

const base = { tradeCurrency: "USD", homeCurrency: "KRW", quantity: 10, mode: "total", amount: 1_950_000, unknown: false } as const;

test("매입금액 기본 입력 단위는 계좌통화가 아니라 증권사 화면을 따른다", () => {
  assert.equal(defaultCostBasisMode("SBI"), "perShare");
  assert.equal(defaultCostBasisMode("KB"), "total");
});

test("국내 종목은 입력을 무시한다", () => {
  assert.deepEqual(resolveCostBasisHome({ ...base, tradeCurrency: "KRW" }), { ok: true, costBasisHome: undefined });
});

test("해외 종목: 총액 / 1주당 입력 → 총액으로 저장", () => {
  assert.deepEqual(resolveCostBasisHome(base), { ok: true, costBasisHome: 1_950_000 });
  assert.deepEqual(resolveCostBasisHome({ ...base, homeCurrency: "JPY", mode: "perShare", amount: 21_500 }), {
    ok: true,
    costBasisHome: 215_000,
  });
});

test("해외 종목: 비어 있으면 '모름' 체크 없이는 거부", () => {
  assert.equal(resolveCostBasisHome({ ...base, amount: undefined }).ok, false);
  assert.deepEqual(resolveCostBasisHome({ ...base, amount: undefined, unknown: true }), { ok: true, costBasisHome: undefined });
});

test("평균 매입환율과 경고", () => {
  assert.equal(impliedFxRate(1_950_000, 10, 150), 1_300);
  assert.equal(impliedFxRate(0, 10, 150), null);
  assert.equal(impliedFxRate(1_000, 10, 0), null);
  assert.equal(isFxRateSuspicious(1_300, 1_350), false);
  // 추가 매수 뒤 매입금액을 안 고친 경우: 수량·단가는 2배인데 매입금액은 그대로 → 650원/$
  assert.equal(isFxRateSuspicious(650, 1_350), true);
});

test("일부 매도: 매입금액을 수량 비율로 줄인다", () => {
  assert.equal(scaleCostBasis(1_950_000, 10, 4), 780_000);
});
