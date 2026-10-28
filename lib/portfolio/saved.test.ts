import { expect, it } from "vitest";
import { loadSaved, serializeSaved, type SavedV1 } from "./saved";
import { usTradesUtf8 } from "../sbi/fixtures";
import { holdingsFromTrades, parseUsTrades } from "../sbi/us-trades";
import { importSbiFiles } from "../sbi/import";

it("rejects ambiguous duplicate 기준 보유정보 for the same stock and account", () => {
  const baseline = { ticker: "TSTA", name: "US-A", account: "特定", asOf: "2026-10-28", quantity: 10, avgCost: 100 };
  expect(loadSaved(JSON.stringify({ version: 1, sbiUsBaselines: [baseline, { ...baseline, quantity: 20 }] }))).toEqual({ status: "unreadable" });
});

it("normalizes zero-share cost and refuses invalid saved 기준 보유정보", () => {
  const baseline = { ticker: "TSTA", name: "US-A", account: "特定", asOf: "2026-10-28", quantity: 0, avgCost: 100 };
  expect(loadSaved(serializeSaved({ version: 1, sbiUsBaselines: [baseline] }))).toEqual({ status: "ok", saved: { version: 1, sbiUsBaselines: [{ ...baseline, avgCost: 0 }] } });
  for (const change of [{ asOf: "2026-02-30" }, { quantity: -1 }, { avgCost: -1 }, { ticker: "BAD KEY" }, { account: "" }]) {
    expect(loadSaved(JSON.stringify({ version: 1, sbiUsBaselines: [{ ...baseline, ...change }] }))).toEqual({ status: "unreadable" });
  }
});

it("preserves 기준 보유정보 through reloads and overlapping CSV imports without adding older buys again", () => {
  const baseline = { ticker: "TSTA", name: "US-A", account: "特定", asOf: "2026-10-28", quantity: 8, avgCost: 70 };
  const saved = { version: 1 as const, sbiUsBaselines: [baseline] };
  const restored = loadSaved(serializeSaved(saved));
  expect(restored).toEqual({ status: "ok", saved });
  if (restored.status !== "ok") throw new Error("Expected saved 기준 보유정보");
  const file = { name: "trades.csv", bytes: usTradesUtf8 };
  const first = importSbiFiles([file], restored.saved, new Date("2026-10-29T00:00:00Z"));
  const repeated = importSbiFiles([file], first.saved, new Date("2026-10-30T00:00:00Z"));
  expect(repeated.saved.sbiUsBaselines).toEqual([baseline]);
  expect(repeated.saved.sbiUsTrades!.trades).toEqual(first.saved.sbiUsTrades!.trades);
  expect(holdingsFromTrades(repeated.saved.sbiUsTrades!.trades, repeated.saved.sbiUsBaselines).holdings)
    .toContainEqual(expect.objectContaining({ code: "TSTA", quantity: 8, avgCost: 70 }));
});

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
