import { expect, it } from "vitest";
import { loadSaved, serializeSaved, type SavedV1 } from "./saved";

it("round-trips SavedV1 and validates the full persisted shape before displaying holdings", () => {
  const saved: SavedV1 = { version: 1, sbiPortfolio: { uploadedAt: "2026-10-28T00:00:00.000Z", notices: [], holdings: [{ broker: "SBI", market: "JP", account: "特定", code: "1111", name: "JP-A", quantity: 10, avgCost: 1000, csvQuote: { price: 1200, asOf: "2026-10-28T00:00:00.000Z" } }] } };
  expect(loadSaved(serializeSaved(saved))).toEqual({ status: "ok", saved });
  expect(loadSaved(null)).toEqual({ status: "empty" });
  expect(loadSaved('{"version":2}')).toEqual({ status: "unreadable" });
  expect(loadSaved(JSON.stringify({ ...saved, sbiPortfolio: { ...saved.sbiPortfolio, holdings: [{ ...saved.sbiPortfolio!.holdings[0], quantity: "10" }] } }))).toEqual({ status: "unreadable" });
  expect(loadSaved("{")).toEqual({ status: "unreadable" });
});
