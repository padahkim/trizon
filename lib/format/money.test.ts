import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney, formatPercent, formatUnitPrice, perUnitsLabel } from "./money.ts";

test("간략: 1만 미만은 그대로", () => {
  assert.equal(formatMoney(9_999, "KRW"), "9,999원");
  assert.equal(formatMoney(0, "KRW"), "0원");
  assert.equal(formatMoney(1_234.56, "USD"), "1,234.56달러");
  assert.equal(formatMoney(9_999.4, "JPY"), "9,999엔");
});

test("간략: 1만~1억은 만 + 나머지", () => {
  assert.equal(formatMoney(10_000, "KRW"), "1만 원");
  assert.equal(formatMoney(100_000, "USD"), "10만 달러");
  assert.equal(formatMoney(92_345.67, "USD"), "9만 2,346달러");
  assert.equal(formatMoney(13_800_000, "JPY"), "1,380만 엔");
  assert.equal(formatMoney(99_999.6, "KRW"), "10만 원"); // 정수 반올림 뒤 나눈다
  assert.equal(formatMoney(9_999.6, "KRW"), "1만 원");
});

test("간략: 1억 이상은 만 단위 반올림, 0만은 붙이지 않는다", () => {
  assert.equal(formatMoney(123_456_789, "KRW"), "1억 2,346만 원");
  assert.equal(formatMoney(100_000_000, "KRW"), "1억 원");
  assert.equal(formatMoney(199_995_000, "KRW"), "2억 원"); // 반올림 올림
  assert.equal(formatMoney(99_999_999.6, "KRW"), "1억 원");
  assert.equal(formatMoney(1_2345_0000_0000, "KRW"), "1조 2,345억 원");
  assert.equal(formatMoney(1_0000_0001_0000, "KRW"), "1조 1만 원");
});

test("음수와 부호", () => {
  assert.equal(formatMoney(-123_456_789, "KRW"), "-1억 2,346만 원");
  assert.equal(formatMoney(-5_000, "JPY"), "-5,000엔");
  assert.equal(formatMoney(12_000, "KRW", "compact", { signed: true }), "+1만 2,000원");
  assert.equal(formatMoney(0, "KRW", "compact", { signed: true }), "0원");
  assert.equal(formatMoney(-0.001, "USD"), "0달러");
});

test("정확 모드", () => {
  assert.equal(formatMoney(123_456_789.4, "KRW", "exact"), "123,456,789원");
  assert.equal(formatMoney(92_345.6, "USD", "exact"), "92,345.60달러");
  assert.equal(formatMoney(-1_500, "JPY", "exact"), "-1,500엔");
});

test("수익률·단가", () => {
  assert.equal(formatPercent(0.1234), "+12.34%");
  assert.equal(formatPercent(-0.05), "-5.00%");
  assert.equal(formatPercent(-0.00001), "0.00%");
  assert.equal(formatPercent(null), "—");
  assert.equal(formatUnitPrice(71_500, "KRW"), "71,500원");
  assert.equal(formatUnitPrice(187.2, "USD"), "187.20달러");
  assert.equal(formatUnitPrice(0.12345, "USD"), "0.1235달러");
});

test("N좌당 가격 꼬리표", () => {
  assert.equal(perUnitsLabel(10_000), "/1만좌");
  assert.equal(perUnitsLabel(1_000), "/1,000좌");
  assert.equal(perUnitsLabel(1), "");
  assert.equal(perUnitsLabel(undefined), "");
});
