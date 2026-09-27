import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteSymbolCandidates } from "./symbols.ts";

const ok = (r: ReturnType<typeof quoteSymbolCandidates>) => {
  assert.ok(r.ok, `expected ok: ${JSON.stringify(r)}`);
  return r;
};

test("KR: KOSPI → KOSDAQ 순으로 시도, HTS 식 A 접두사와 영숫자 코드 허용", () => {
  assert.deepEqual(ok(quoteSymbolCandidates("KR", "005930")).candidates, ["005930.KS", "005930.KQ"]);
  assert.deepEqual(ok(quoteSymbolCandidates("KR", " a005930 ")).candidates, ["005930.KS", "005930.KQ"]);
  assert.equal(ok(quoteSymbolCandidates("KR", "0088M0")).code, "0088M0");
  assert.equal(ok(quoteSymbolCandidates("KR", "005930.KQ")).code, "005930");
});

test("JP: 4자리(영숫자 포함) → .T", () => {
  assert.deepEqual(ok(quoteSymbolCandidates("JP", "7203")).candidates, ["7203.T"]);
  assert.deepEqual(ok(quoteSymbolCandidates("JP", "285a")).candidates, ["285A.T"]);
  assert.deepEqual(ok(quoteSymbolCandidates("JP", "7203.T")).candidates, ["7203.T"]);
});

test("US: 클래스 주식 . → -", () => {
  assert.deepEqual(ok(quoteSymbolCandidates("US", "aapl")).candidates, ["AAPL"]);
  assert.deepEqual(ok(quoteSymbolCandidates("US", "BRK.B")).candidates, ["BRK-B"]);
  assert.deepEqual(ok(quoteSymbolCandidates("US", "BRK-B")).candidates, ["BRK-B"]);
});

test("잘못된 입력은 거부", () => {
  assert.equal(quoteSymbolCandidates("KR", "5930").ok, false);
  assert.equal(quoteSymbolCandidates("KR", "삼성전자").ok, false);
  assert.equal(quoteSymbolCandidates("JP", "72030").ok, false);
  assert.equal(quoteSymbolCandidates("JP", "A203").ok, false);
  assert.equal(quoteSymbolCandidates("US", "").ok, false);
  assert.equal(quoteSymbolCandidates("US", "AAPL US").ok, false);
});
