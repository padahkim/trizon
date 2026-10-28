import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

it("selects the fake provider through TRIZON_QUOTES without contacting Yahoo", async () => {
  vi.stubEnv("TRIZON_QUOTES", "fake");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T09:00:00Z"));
  const response = await GET(new Request("http://localhost/api/quotes?keys=JP:1111"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ quotes: {
    "JP:1111": { price: 1200, previousClose: 1150, currency: "JPY", marketTime: "2026-10-28T06:00:00.000Z" },
  } });
});
