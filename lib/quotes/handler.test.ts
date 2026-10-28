import { afterEach, expect, it, vi } from "vitest";
import { createQuoteHandler } from "./handler";
import { createFakeProvider } from "./fake";

afterEach(() => vi.useRealTimers());

it("returns fake quotes and omits unknown symbols in a 200 response", async () => {
  const get = createQuoteHandler(createFakeProvider(() => new Date("2026-10-28T09:00:00Z")));
  const response = await get(new Request("http://localhost/api/quotes?keys=JP:1111,JP:999A,US:ZZA,US:ZZB,JP:0000"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ quotes: {
    "JP:1111": { price: 1200, previousClose: 1150, currency: "JPY", marketTime: "2026-10-28T06:00:00.000Z" },
    "JP:999A": { price: 800, previousClose: 820, currency: "JPY", marketTime: "2026-10-28T06:00:00.000Z" },
    "US:ZZA": { price: 45.5, previousClose: 46, currency: "USD", marketTime: "2026-10-27T20:00:00.000Z" },
    "US:ZZB": { price: 25, previousClose: 24.5, currency: "USD", marketTime: "2026-10-27T20:00:00.000Z" },
  } });
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it.each(["", "?keys=", "?keys=JP:123", "?keys=JP:12345", "?keys=US:", "?keys=US:aapl", "?keys=US:AAPL,JP:!234", "?keys=KR:005930"])("rejects malformed or unsupported keys with 400: %s", async (query) => {
  const response = await createQuoteHandler(createFakeProvider())(new Request(`http://localhost/api/quotes${query}`));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "시세 키 형식이 올바르지 않습니다" });
});

it("accepts alphanumeric Japanese codes and dotted US tickers, returning 200 even if all are unknown", async () => {
  const response = await createQuoteHandler(createFakeProvider())(new Request("http://localhost/api/quotes?keys=JP:130A,US:BRK.B"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ quotes: {} });
});

it("returns 502 for a failed provider without exposing its error", async () => {
  const get = createQuoteHandler({ name: "failed fake", async fetchQuotes() { throw new Error("private upstream details"); } });
  const response = await get(new Request("http://localhost/api/quotes?keys=JP:1111"));
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "시세를 받지 못했습니다" });
});

it("returns 502 after ten seconds when the provider does not respond", async () => {
  vi.useFakeTimers();
  const get = createQuoteHandler({ name: "stalled fake", fetchQuotes: () => new Promise(() => {}) });
  const response = get(new Request("http://localhost/api/quotes?keys=JP:1111"));
  await vi.advanceTimersByTimeAsync(10_000);
  expect((await response).status).toBe(502);
  expect(await (await response).json()).toEqual({ error: "시세를 받지 못했습니다" });
  expect(vi.getTimerCount()).toBe(0);
});
