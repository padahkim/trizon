import { test } from "node:test";
import assert from "node:assert/strict";
import { holdingFormSchema, portfolioFileSchema } from "./schema.ts";

const form = {
  accountId: "kb",
  market: "US",
  code: "AAPL",
  name: "",
  quantity: "1.5",
  avgCost: "150.25",
};

test("폼: 콤마·공백 제거, 소수 수량 허용, 선택 항목 생략 가능", () => {
  const r = holdingFormSchema.parse({ ...form, quantity: " 1,234.5 ", costBasisAmount: "1,950,000" });
  assert.equal(r.quantity, 1234.5);
  assert.equal(r.costBasisAmount, 1_950_000);
  assert.equal(r.costBasisMode, "total");
  assert.equal(r.costBasisUnknown, false);

  const minimal = holdingFormSchema.parse(form);
  assert.equal(minimal.costBasisAmount, undefined);
  assert.equal(minimal.id, undefined);
  assert.equal(holdingFormSchema.parse({ ...form, costBasisAmount: "", costBasisUnknown: "on" }).costBasisUnknown, true);
});

test("폼: 수량 0 이하·숫자 아님은 거부", () => {
  assert.equal(holdingFormSchema.safeParse({ ...form, quantity: "0" }).success, false);
  assert.equal(holdingFormSchema.safeParse({ ...form, quantity: "-1" }).success, false);
  assert.equal(holdingFormSchema.safeParse({ ...form, quantity: "abc" }).success, false);
  assert.equal(holdingFormSchema.safeParse({ ...form, quantity: "" }).success, false);
  assert.equal(holdingFormSchema.safeParse({ ...form, avgCost: "-1" }).success, false);
});

const file = {
  version: 1,
  accounts: [{ id: "kb", broker: "KB", label: "KB증권", homeCurrency: "KRW" }],
  holdings: [
    {
      id: "h1",
      accountId: "kb",
      market: "KR",
      code: "005930",
      quoteSymbol: "005930.KS",
      name: "삼성전자",
      quantity: 10,
      avgCost: 70000,
      updatedAt: "2026-09-25T00:00:00Z",
    },
  ],
};

test("파일: 정상 파일 통과", () => {
  assert.equal(portfolioFileSchema.safeParse(file).success, true);
});

test("파일: 없는 계좌 참조·같은 종목 중복·수량 0 거부", () => {
  const h = file.holdings[0];
  assert.equal(portfolioFileSchema.safeParse({ ...file, holdings: [{ ...h, accountId: "nope" }] }).success, false);
  assert.equal(portfolioFileSchema.safeParse({ ...file, holdings: [h, { ...h, id: "h2" }] }).success, false);
  assert.equal(portfolioFileSchema.safeParse({ ...file, holdings: [{ ...h, quantity: 0 }] }).success, false);
  assert.equal(portfolioFileSchema.safeParse({ ...file, version: 2 }).success, false);
});
