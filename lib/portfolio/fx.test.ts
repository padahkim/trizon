import { test } from "node:test";
import assert from "node:assert/strict";
import { convert, crossRate, makeRates } from "./fx.ts";

const rates = makeRates(1_350, 150);

test("같은 통화는 그대로", () => {
  assert.equal(convert(1234.5, "KRW", "KRW", rates), 1234.5);
});

test("USD 기준 교차 환산", () => {
  assert.equal(convert(100, "USD", "KRW", rates), 135_000);
  assert.equal(convert(15_000, "JPY", "USD", rates), 100);
  assert.equal(crossRate("JPY", "KRW", rates), 9); // 1엔 = 9원 → 100엔 = 900원
});

test("KRW → JPY → KRW 왕복", () => {
  const krw = 123_456_789;
  const back = convert(convert(krw, "KRW", "JPY", rates), "JPY", "KRW", rates);
  assert.ok(Math.abs(back - krw) < 1e-6);
});

test("0 이하 환율은 거부", () => {
  assert.throws(() => makeRates(0, 150));
  assert.throws(() => makeRates(1350, Number.NaN));
});
