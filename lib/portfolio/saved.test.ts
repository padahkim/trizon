import { expect, it } from "vitest";
import { loadSaved, serializeSaved, type SavedV1 } from "./saved";
import { usTradesUtf8 } from "../sbi/fixtures";
import { holdingsFromTrades, parseUsTrades } from "../sbi/us-trades";

it("round-trips SavedV1 and validates the full persisted shape before displaying holdings", () => {
  const saved: SavedV1 = { version: 1, sbiPortfolio: { uploadedAt: "2026-10-28T00:00:00.000Z", notices: [], holdings: [{ broker: "SBI", market: "JP", account: "特定", code: "1111", name: "JP-A", quantity: 10, avgCost: 1000, csvQuote: { price: 1200, asOf: "2026-10-28T00:00:00.000Z" } }] } };
  expect(loadSaved(serializeSaved(saved))).toEqual({ status: "ok", saved });
  expect(loadSaved(null)).toEqual({ status: "empty" });
  expect(loadSaved('{"version":2}')).toEqual({ status: "unreadable" });
  expect(loadSaved(JSON.stringify({ ...saved, sbiPortfolio: { ...saved.sbiPortfolio, holdings: [{ ...saved.sbiPortfolio!.holdings[0], quantity: "10" }] } }))).toEqual({ status: "unreadable" });
  expect(loadSaved("{")).toEqual({ status: "unreadable" });
});

it("restores accumulated trades, settlements, and the missing historical buys notice after a reload", () => {
  const { trades } = parseUsTrades(usTradesUtf8);
  const saved: SavedV1 = { version: 1, sbiUsTrades: { uploadedAt: "2026-10-28T00:00:00.000Z", trades: [...trades, { ...trades[0], key: "older-sale", tradeDate: "2026-09-01", side: "sell" }] } };
  const restored = loadSaved(serializeSaved(saved));
  expect(restored).toEqual({ status: "ok", saved });
  if (restored.status !== "ok") throw new Error("Expected saved ledger");
  expect(holdingsFromTrades(restored.saved.sbiUsTrades!.trades)).toMatchObject({
    holdings: [{ code: "TSTB", quantity: 2, avgCost: 20 }],
    notices: [expect.stringContaining("US-A (TSTA · 特定): 계산할 수 없음: 2년 이전 매수분 필요")],
  });
  expect(loadSaved(JSON.stringify({ ...saved, sbiUsTrades: { ...saved.sbiUsTrades, trades: [{ ...trades[0], quantity: "4" }] } }))).toEqual({ status: "unreadable" });
});
