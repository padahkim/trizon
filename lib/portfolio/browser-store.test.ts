import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearSavedSnapshot, getSavedSnapshot, recoverSavedSnapshot, STORAGE_RECOVERED, STORAGE_UNAVAILABLE, subscribeSaved, writeSavedSnapshot } from "./browser-store";
import { importSbiFiles } from "../sbi/import";
import { portfolioUtf8, usTradesUtf8 } from "../sbi/fixtures";
import { loadSaved, serializeSaved } from "./saved";

beforeEach(() => {
  // Cross-tab delivery is exercised with actual browser tabs in e2e/us-baselines.spec.ts.
  vi.stubGlobal("BroadcastChannel", undefined);
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  });
  vi.stubGlobal("window", new EventTarget());
  clearSavedSnapshot();
});

afterEach(() => { vi.unstubAllGlobals(); });

it.each(["{broken-json", '{"version":999}'])("moves unreadable data to a backup before starting empty: %s", (raw) => {
  localStorage.setItem("trizon", raw);

  recoverSavedSnapshot();

  expect(localStorage.getItem("trizon:backup")).toBe(raw);
  expect(localStorage.getItem("trizon")).toBeNull();
  expect(getSavedSnapshot()).toBe(STORAGE_RECOVERED);
});

it("restores both sources after saving, then clears holdings, trades, and backups without deleting unrelated storage", () => {
  const { saved } = importSbiFiles([
    { name: "portfolio.csv", bytes: portfolioUtf8 },
    { name: "trades.csv", bytes: usTradesUtf8 },
  ], { version: 1 }, new Date("2026-10-28T00:00:00Z"));
  writeSavedSnapshot(serializeSaved(saved));
  expect(loadSaved(getSavedSnapshot() as string)).toEqual({ status: "ok", saved });
  localStorage.setItem("trizon:backup", "{original");
  localStorage.setItem("trizon:backup:older", "{older");
  localStorage.setItem("unrelated", "keep");
  const changes = vi.fn();
  const unsubscribe = subscribeSaved(changes);

  clearSavedSnapshot();

  expect(getSavedSnapshot()).toBeNull();
  expect(loadSaved(getSavedSnapshot() as null)).toEqual({ status: "empty" });
  expect(localStorage.getItem("trizon:backup")).toBeNull();
  expect(localStorage.getItem("trizon:backup:older")).toBeNull();
  expect(localStorage.getItem("unrelated")).toBe("keep");
  expect(changes).toHaveBeenCalledOnce();
  unsubscribe();
});

it("keeps an unreadable original active if its backup cannot be saved", () => {
  localStorage.setItem("trizon", "{original");
  vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("storage full"); });

  expect(() => recoverSavedSnapshot()).toThrow("storage full");

  expect(getSavedSnapshot()).toBe("{original");
  expect(localStorage.getItem("trizon:backup")).toBeNull();
});

it("preserves earlier backups when another unreadable value is recovered", () => {
  localStorage.setItem("trizon:backup", "{older");
  localStorage.setItem("trizon", "{newer");

  recoverSavedSnapshot();

  expect(localStorage.getItem("trizon:backup")).toBe("{older");
  expect(Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index)!)))
    .toEqual(expect.arrayContaining(["{older", "{newer"]));
  expect(getSavedSnapshot()).toBe(STORAGE_RECOVERED);
});

it("does not remove valid data written by another tab before recovery runs", () => {
  writeSavedSnapshot('{"version":1}');

  recoverSavedSnapshot();

  expect(getSavedSnapshot()).toBe('{"version":1}');
  expect(localStorage.getItem("trizon:backup")).toBeNull();
});

it("preserves a newer snapshot written by another tab while the unreadable value is being backed up", () => {
  localStorage.setItem("trizon", "{original");
  const setItem = localStorage.setItem;
  vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
    setItem(key, value);
    if (key === "trizon:backup") setItem("trizon", '{"version":1}');
  });

  recoverSavedSnapshot();

  expect(getSavedSnapshot()).toBe('{"version":1}');
  expect(localStorage.getItem("trizon:backup")).toBe("{original");
});

it("reports denied reads and failed writes without replacing the last saved value", () => {
  writeSavedSnapshot('{"version":1}');
  vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("storage full"); });

  expect(() => writeSavedSnapshot('{"version":1,"sbiPortfolio":{}}')).toThrow("storage full");
  expect(getSavedSnapshot()).toBe('{"version":1}');

  vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("storage denied"); });
  expect(getSavedSnapshot()).toBe(STORAGE_UNAVAILABLE);
});

it("does not report successful deletion when the browser refuses to remove data", () => {
  writeSavedSnapshot('{"version":1}');
  vi.spyOn(localStorage, "removeItem").mockImplementation(() => { throw new Error("storage denied"); });
  const changes = vi.fn();
  const unsubscribe = subscribeSaved(changes);

  expect(() => clearSavedSnapshot()).toThrow("storage denied");

  expect(getSavedSnapshot()).toBe('{"version":1}');
  expect(changes).not.toHaveBeenCalled();
  unsubscribe();
});
