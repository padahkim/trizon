import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumberInput } from "./input.ts";

test("폼 숫자: 콤마·공백을 지우고, 빈 칸은 undefined, 숫자가 아니면 NaN", () => {
  assert.equal(parseNumberInput("1,234,567"), 1_234_567);
  assert.equal(parseNumberInput(" 12.5 "), 12.5);
  assert.equal(parseNumberInput("1,000"), 1_000);
  assert.equal(parseNumberInput("   "), undefined);
  assert.ok(Number.isNaN(parseNumberInput("12a")));
});
