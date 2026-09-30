import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeRates } from "../portfolio/fx.ts";
import { createQuoteService, NoFxError } from "./service.ts";
import type { FxProvider, Quote, QuoteProvider } from "./types.ts";

const marketTime = "2026-09-25T06:30:00Z";

function fakeQuotes(prices: Record<string, number>) {
  let calls = 0;
  let fail = false;
  const provider: QuoteProvider = {
    name: "fake",
    async fetchQuotes(symbols) {
      calls++;
      if (fail) throw new Error("429 Too Many Requests");
      const out: Record<string, Quote> = {};
      for (const s of symbols) if (prices[s]) out[s] = { symbol: s, price: prices[s], currency: "KRW", marketTime };
      return out;
    },
  };
  return { provider, calls: () => calls, setFail: (v: boolean) => (fail = v) };
}

function fakeFx(name: string, krw: number, fail = false): FxProvider {
  return {
    name,
    async fetchFx() {
      if (fail) throw new Error(`${name} down`);
      return { rates: makeRates(krw, 150), asOf: marketTime, source: name };
    },
  };
}

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "trizon-quotes-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function clock(start: string) {
  let t = new Date(start).getTime();
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
}

test("TTL 안에서는 다시 조회하지 않고, 받은 시세는 디스크에 저장한다", () =>
  withTempDir(async (dir) => {
    const q = fakeQuotes({ "005930.KS": 285_500 });
    const c = clock("2026-09-26T00:00:00Z");
    const cachePath = join(dir, "quotes-cache.json");
    const svc = createQuoteService({ quoteProvider: q.provider, fxProviders: [fakeFx("yahoo", 1350)], cachePath, now: c.now });

    const first = await svc.get(["005930.KS"]);
    assert.equal(first.quotes["005930.KS"].price, 285_500);
    assert.equal(first.quotes["005930.KS"].fromCache, false);
    assert.deepEqual(first.errors, []);

    c.advance(60_000);
    await svc.get(["005930.KS"]);
    assert.equal(q.calls(), 1);

    const disk = JSON.parse(await readFile(cachePath, "utf8"));
    assert.equal(disk.quotes["005930.KS"].price, 285_500);
    assert.equal(disk.fx.rates.KRW, 1350);
  }));

test("조회 실패 → 마지막 시세를 fromCache 로, 1분 동안은 재시도하지 않는다", () =>
  withTempDir(async (dir) => {
    const q = fakeQuotes({ "005930.KS": 285_500 });
    const c = clock("2026-09-26T00:00:00Z");
    const svc = createQuoteService({
      quoteProvider: q.provider,
      fxProviders: [fakeFx("yahoo", 1350)],
      cachePath: join(dir, "c.json"),
      now: c.now,
    });
    await svc.get(["005930.KS"]);

    q.setFail(true);
    c.advance(16 * 60_000);
    const failed = await svc.get(["005930.KS"]);
    assert.equal(failed.quotes["005930.KS"].fromCache, true);
    assert.equal(failed.quotes["005930.KS"].price, 285_500);
    assert.ok(failed.errors.some((e) => e.includes("429")));
    assert.equal(q.calls(), 2);

    c.advance(10_000);
    await svc.get(["005930.KS"]);
    assert.equal(q.calls(), 2); // 백오프

    q.setFail(false);
    await svc.invalidate(); // 새로고침 버튼은 백오프도 무시한다
    const recovered = await svc.get(["005930.KS"]);
    assert.equal(q.calls(), 3);
    assert.equal(recovered.quotes["005930.KS"].fromCache, false);
  }));

test("응답에서 빠진 종목도 TTL 동안은 다시 묻지 않고, 그동안 계속 경고한다", () =>
  withTempDir(async (dir) => {
    const prices: Record<string, number> = { "005930.KS": 285_500, "000660.KS": 210_000 };
    const q = fakeQuotes(prices);
    const c = clock("2026-09-26T00:00:00Z");
    const svc = createQuoteService({
      quoteProvider: q.provider,
      fxProviders: [fakeFx("yahoo", 1350)],
      cachePath: join(dir, "c.json"),
      now: c.now,
    });
    await svc.get(["005930.KS", "000660.KS"]);

    delete prices["000660.KS"]; // 캐시에 있던 종목이 응답에서 빠진다
    c.advance(16 * 60_000);
    const partial = await svc.get(["005930.KS", "000660.KS", "999999.KS"]); // 처음 보는 종목도 없다
    assert.equal(q.calls(), 2);
    assert.equal(partial.quotes["000660.KS"].fromCache, true);
    assert.equal(partial.quotes["999999.KS"], undefined);
    assert.deepEqual(partial.errors, ["시세를 받지 못한 종목: 000660.KS, 999999.KS"]);

    c.advance(60_000);
    const again = await svc.get(["005930.KS", "000660.KS", "999999.KS"]);
    assert.equal(q.calls(), 2); // 1분 백오프가 아니라 TTL 까지 기다린다
    assert.equal(again.quotes["000660.KS"].fromCache, true);
    assert.deepEqual(again.errors, ["시세를 받지 못한 종목: 000660.KS, 999999.KS"]);

    prices["000660.KS"] = 212_000;
    c.advance(15 * 60_000);
    const back = await svc.get(["005930.KS", "000660.KS", "999999.KS"]);
    assert.equal(q.calls(), 3);
    assert.equal(back.quotes["000660.KS"].price, 212_000);
    assert.equal(back.quotes["000660.KS"].fromCache, false);
    assert.deepEqual(back.errors, ["시세를 받지 못한 종목: 999999.KS"]);
  }));

test("재시작 후 조회가 실패해도 디스크 캐시로 뜬다", () =>
  withTempDir(async (dir) => {
    const cachePath = join(dir, "c.json");
    const c = clock("2026-09-26T00:00:00Z");
    const ok = fakeQuotes({ "005930.KS": 285_500 });
    await createQuoteService({ quoteProvider: ok.provider, fxProviders: [fakeFx("yahoo", 1350)], cachePath, now: c.now }).get([
      "005930.KS",
    ]);

    c.advance(60 * 60_000);
    const down = fakeQuotes({});
    down.setFail(true);
    const svc = createQuoteService({
      quoteProvider: down.provider,
      fxProviders: [fakeFx("yahoo", 0, true), fakeFx("frankfurter", 0, true)],
      cachePath,
      now: c.now,
    });
    const md = await svc.get(["005930.KS"]);
    assert.equal(md.quotes["005930.KS"].fromCache, true);
    assert.equal(md.fx.fromCache, true);
    assert.equal(md.fx.rates.KRW, 1350);
  }));

test("환율: 첫 provider 가 실패하면 다음 것, 전부 실패하고 캐시도 없으면 NoFxError", () =>
  withTempDir(async (dir) => {
    const q = fakeQuotes({});
    const svc = createQuoteService({
      quoteProvider: q.provider,
      fxProviders: [fakeFx("yahoo", 0, true), fakeFx("frankfurter", 1355)],
      cachePath: join(dir, "a.json"),
    });
    const md = await svc.get([]);
    assert.equal(md.fx.source, "frankfurter");
    assert.ok(md.errors.length === 0);

    const none = createQuoteService({
      quoteProvider: q.provider,
      fxProviders: [fakeFx("yahoo", 0, true)],
      cachePath: join(dir, "b.json"),
    });
    await assert.rejects(none.get([]), NoFxError);
  }));
