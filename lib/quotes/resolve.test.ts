import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBestQuote } from "./resolve.ts";
import type { Quote } from "./types.ts";

const now = new Date("2026-09-26T05:00:00Z");
const q = (symbol: string, price: number, marketTime: string, currency = "KRW"): Quote => ({ symbol, price, currency, marketTime });

// 2026-09-26 에 Yahoo 에서 실제로 관측한 응답 (없는 조합도 옛 시세를 돌려준다)
const observed: Record<string, Quote> = {
  "005930.KS": q("005930.KS", 285_500, "2026-09-23T06:30:06Z"),
  "005930.KQ": q("005930.KQ", 84_400, "2024-07-19T20:00:00Z"),
  "247540.KS": q("247540.KS", 194_000, "2024-07-19T20:00:00Z"),
  "247540.KQ": q("247540.KQ", 105_000, "2026-09-23T06:30:01Z"),
  "086520.KQ": q("086520.KQ", 80_100, "2026-09-23T06:30:08Z"),
};

test("KOSPI 종목: .KS 선택 (.KQ 유령 시세 무시)", () => {
  const r = pickBestQuote(["005930.KS", "005930.KQ"], observed, "KRW", now);
  assert.ok(r.ok);
  assert.equal(r.quote.symbol, "005930.KS");
});

test("KOSDAQ 종목: .KS 유령 시세가 먼저 와도 .KQ 선택", () => {
  const r = pickBestQuote(["247540.KS", "247540.KQ"], observed, "KRW", now);
  assert.ok(r.ok);
  assert.equal(r.quote.symbol, "247540.KQ");
  const only = pickBestQuote(["086520.KS", "086520.KQ"], observed, "KRW", now);
  assert.ok(only.ok && only.quote.symbol === "086520.KQ");
});

test("후보가 전부 오래된 시세면 거부 (상장폐지 의심)", () => {
  const r = pickBestQuote(["005930.KQ"], observed, "KRW", now);
  assert.equal(r.ok, false);
});

test("못 찾음 / 통화 불일치", () => {
  assert.equal(pickBestQuote(["999999.KS"], observed, "KRW", now).ok, false);
  const mismatch = pickBestQuote(["005930.KS"], observed, "USD", now);
  assert.ok(!mismatch.ok && mismatch.error.includes("KRW"));
});
