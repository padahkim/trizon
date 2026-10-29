import { expect, it } from "vitest";
import { importSbiFiles } from "./import";
import { portfolioShiftJis, portfolioUtf8, usTradesCsv, usTradesUtf8 } from "./fixtures";
import { holdingsFromTrades } from "./us-trades";
import { loadSaved, serializeSaved } from "../portfolio/saved";
import type { SavedV1 } from "../portfolio/saved";
import { evaluate } from "../portfolio/evaluate";

it("keeps the CSV fund valuation and day change when displayed unit prices have been rounded", () => {
  const result = importSbiFiles([{ name: "fund.csv", bytes: new TextEncoder().encode(`ポートフォリオ一覧
投資信託(金額/NISA預り(つみたて投資枠))
ファンド名,数量,取得単価,現在値,前日比,損益,評価額
架空ファンドA,12500,8000,10000,100,2500.49,12500.49
`) }], { version: 1 }, new Date("2026-10-30T00:00:00Z"));
  const restored = loadSaved(serializeSaved(result.saved));
  expect(restored.status).toBe("ok");
  if (restored.status !== "ok") throw new Error("expected saved portfolio");
  const portfolio = evaluate(restored.saved.sbiPortfolio!.holdings);
  expect(portfolio.totals.JPY).toEqual({ value: 12500.49, pnl: 2500.49, dayChange: 125, noQuote: 0 });
});

it("imports investment trusts in both NISA buckets and restores them with the other holdings", () => {
  const csv = `ポートフォリオ一覧
株式(現物/特定預り)
銘柄(コード),数量,取得単価,現在値
1111 JP-A,10,1000,1200
投資信託(金額/NISA預り(成長投資枠))
ファンド名,数量,取得単価,現在値
架空ファンドA,12500,8000,10000
投資信託(金額/NISA預り(つみたて投資枠))
ファンド名,数量,取得単価,現在値
架空ファンドA,25000,9000,10000
`;
  const result = importSbiFiles([
    { name: "funds.csv", bytes: new TextEncoder().encode(csv) },
    { name: "trades.csv", bytes: usTradesUtf8 },
  ], { version: 1 }, new Date("2026-10-30T00:00:00Z"));
  expect(result.files[0]).toEqual({ fileName: "funds.csv", kind: "portfolio", notices: [] });
  expect(result.saved.sbiPortfolio?.holdings).toMatchObject([
    { code: "1111", account: "特定" },
    { assetType: "fund", name: "架空ファンドA", account: "NISA(成長投資枠)", quantity: 12500, avgCost: 8000, csvQuote: { price: 10000 } },
    { assetType: "fund", name: "架空ファンドA", account: "NISA(つみたて投資枠)", quantity: 25000, avgCost: 9000, csvQuote: { price: 10000 } },
  ]);
  expect(result.saved.sbiUsTrades?.trades).toHaveLength(2);
  expect(loadSaved(serializeSaved(result.saved))).toEqual({ status: "ok", saved: result.saved });
});

it("imports both CSV kinds together and accumulates overlapping trades without replacing either source", () => {
  const first = importSbiFiles([
    { name: "one.txt", bytes: portfolioShiftJis },
    { name: "two.txt", bytes: usTradesUtf8 },
  ], { version: 1 }, new Date("2026-10-27T00:00:00Z"));
  expect(first.files).toEqual([
    { fileName: "one.txt", kind: "portfolio", notices: [] },
    { fileName: "two.txt", kind: "usTrades", notices: [] },
  ]);
  expect(first.saved.sbiPortfolio?.holdings).toHaveLength(2);
  expect(holdingsFromTrades(first.saved.sbiUsTrades!.trades).holdings).toMatchObject([
    { code: "TSTA", quantity: 4, avgCost: 50 },
    { code: "TSTB", quantity: 2, avgCost: 20 },
  ]);
  const second = importSbiFiles([
    { name: "two.txt", bytes: usTradesUtf8 },
    { name: "overlap.csv", bytes: new TextEncoder().encode(usTradesCsv + "2026/10/02,US-A,TSTA,米国株式,現買,特定,4,100USD,2026/10/06,400USD\r\n") },
  ], first.saved, new Date("2026-10-28T00:00:00Z"));
  expect(second.saved.sbiUsTrades?.trades).toHaveLength(3);
  expect(second.saved.sbiUsTrades?.uploadedAt).toBe("2026-10-28T00:00:00.000Z");
  expect(holdingsFromTrades(second.saved.sbiUsTrades!.trades).holdings[0]).toMatchObject({ quantity: 8, avgCost: 75 });
  expect(second.saved.sbiPortfolio).toEqual(first.saved.sbiPortfolio);
  expect(first.saved.sbiUsTrades?.trades).toHaveLength(2);
});

it("leaves prior trades untouched for invalid files while still importing valid companion files", () => {
  const original = importSbiFiles([{ name: "original.csv", bytes: usTradesUtf8 }], { version: 1 }, new Date("2026-10-27T00:00:00Z")).saved;
  for (const broken of [
    usTradesCsv.replace("預り区分", "missing"),
    usTradesCsv + "2026/10/02,US-A,TSTA,米国株式,現買,特定,broken,100USD,2026/10/06,400USD",
  ]) {
    const result = importSbiFiles([
      { name: "broken.csv", bytes: new TextEncoder().encode(broken) },
      { name: "valid.csv", bytes: portfolioUtf8 },
    ], original, new Date("2026-10-28T00:00:00Z"));
    expect(result.files[0]).toMatchObject({ kind: "usTrades", error: expect.any(String) });
    expect(result.files[1].error).toBeUndefined();
    expect(result.saved.sbiUsTrades).toEqual(original.sbiUsTrades);
    expect(result.saved.sbiPortfolio?.holdings).toHaveLength(2);
  }
});

it("reports skipped trades and accepts empty trade exports without erasing the ledger", () => {
  const skipped = importSbiFiles([{ name: "mixed.csv", bytes: new TextEncoder().encode(usTradesCsv.replace("US-B,TSTB,米国株式,現買", "US-B,TSTB,米国株式,信用新買")) }], { version: 1 }, new Date("2026-10-27T00:00:00Z"));
  expect(skipped.files[0].notices).toEqual(["건너뛴 거래 1건"]);
  expect(skipped.saved.sbiUsTrades?.trades).toHaveLength(1);
  const empty = importSbiFiles([{ name: "empty.csv", bytes: new TextEncoder().encode(usTradesCsv.split("\r\n").slice(0, 2).join("\r\n")) }], skipped.saved, new Date("2026-10-28T00:00:00Z"));
  expect(empty.files[0].error).toBeUndefined();
  expect(empty.saved.sbiUsTrades?.trades).toEqual(skipped.saved.sbiUsTrades?.trades);
  expect(empty.saved.sbiUsTrades?.uploadedAt).toBe("2026-10-28T00:00:00.000Z");
});

it("identifies contents despite arbitrary filenames, imports multiple files, and replaces only the portfolio snapshot and timestamp", () => {
  const original: SavedV1 = { version: 1, sbiUsTrades: { uploadedAt: "2026-10-20T00:00:00.000Z", trades: [] } };
  const first = importSbiFiles([{ name: "renamed.txt", bytes: portfolioShiftJis }, { name: "also-renamed.csv", bytes: usTradesUtf8 }], original, new Date("2026-10-27T00:00:00Z"));
  expect(first.files).toEqual([
    { fileName: "renamed.txt", kind: "portfolio", notices: [] },
    { fileName: "also-renamed.csv", kind: "usTrades", notices: [] },
  ]);
  expect(first.saved.sbiPortfolio?.holdings).toHaveLength(2);
  const second = importSbiFiles([{ name: "anything", bytes: new TextEncoder().encode('ポートフォリオ一覧\n株式(現物/NISA預り)\n銘柄(コード),数量,取得単価,現在値\n1111 JP-A,10,1000,1200') }], first.saved, new Date("2026-10-28T00:00:00Z"));
  expect(second.saved.sbiPortfolio?.uploadedAt).toBe("2026-10-28T00:00:00.000Z");
  expect(second.saved.sbiPortfolio?.holdings).toHaveLength(1);
  expect(second.saved.sbiPortfolio?.holdings[0].account).toBe("NISA");
  expect(second.saved.sbiUsTrades?.trades).toHaveLength(2);
});

it("rejects files exceeding 5MB without reading them while importing companions (U4)", () => {
  const original: SavedV1 = {
    version: 1,
    sbiPortfolio: { uploadedAt: "2026-10-20T00:00:00.000Z", holdings: [], notices: [] },
  };
  const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
  const result = importSbiFiles([
    { name: "large.csv", bytes: oversized },
    { name: "valid.csv", bytes: usTradesUtf8 },
  ], original, new Date("2026-10-28T00:00:00Z"));
  expect(result.files[0]).toMatchObject({
    fileName: "large.csv",
    kind: null,
    error: expect.stringContaining("5MB"),
  });
  expect(result.files[1]).toMatchObject({
    fileName: "valid.csv",
    kind: "usTrades",
  });
  expect(result.files[1].error).toBeUndefined();
  expect(result.saved.sbiPortfolio).toEqual(original.sbiPortfolio);
  expect(result.saved.sbiUsTrades?.trades).toHaveLength(2);
});

it("rejects multiple portfolio files at once and asks to upload only one (ARCHITECTURE 열린 질문 4)", () => {
  const original: SavedV1 = {
    version: 1,
    sbiPortfolio: {
      uploadedAt: "2026-10-20T00:00:00.000Z",
      holdings: [{ broker: "SBI", account: "特定", market: "JP", code: "1111", name: "JP-A", quantity: 5, avgCost: 1000 }],
      notices: [],
    },
  };
  const result = importSbiFiles([
    { name: "p1.csv", bytes: portfolioUtf8 },
    { name: "p2.csv", bytes: portfolioShiftJis },
    { name: "trades.csv", bytes: usTradesUtf8 },
  ], original, new Date("2026-10-28T00:00:00Z"));

  expect(result.files[0]).toMatchObject({
    fileName: "p1.csv",
    kind: "portfolio",
    error: expect.stringContaining("하나만"),
  });
  expect(result.files[1]).toMatchObject({
    fileName: "p2.csv",
    kind: "portfolio",
    error: expect.stringContaining("하나만"),
  });
  expect(result.files[2]).toMatchObject({
    fileName: "trades.csv",
    kind: "usTrades",
  });
  expect(result.files[2].error).toBeUndefined();
  // Original portfolio is untouched
  expect(result.saved.sbiPortfolio).toEqual(original.sbiPortfolio);
  // US trades were imported
  expect(result.saved.sbiUsTrades?.trades).toHaveLength(2);
});

it("shows the line number when a number cannot be parsed and keeps prior portfolio (U4)", () => {
  const original: SavedV1 = {
    version: 1,
    sbiPortfolio: {
      uploadedAt: "2026-10-20T00:00:00.000Z",
      holdings: [{ broker: "SBI", account: "特定", market: "JP", code: "1111", name: "JP-A", quantity: 5, avgCost: 1000 }],
      notices: [],
    },
  };
  const brokenPortfolio = new TextEncoder().encode(`ポートフォリオ一覧
株式(現物/特定預り)
銘柄(コード),数量,取得単価,現在値
1111 JP-A,invalid,1000,1200
`);
  const result = importSbiFiles([
    { name: "broken-num.csv", bytes: brokenPortfolio },
  ], original, new Date("2026-10-28T00:00:00Z"));

  expect(result.files[0]).toMatchObject({
    fileName: "broken-num.csv",
    kind: "portfolio",
    error: expect.stringMatching(/4행.*숫자/),
  });
  expect(result.saved.sbiPortfolio).toEqual(original.sbiPortfolio);
});

it.each([
  "ポートフォリオ一覧",
  "ポートフォリオ一覧\n株式(現物/特定預り)\n銘柄(コード),数量,現在値",
  "ポートフォリオ一覧\n株式(現物/特定預り)\n銘柄(コード),取得単価,現在値",
  "ポートフォリオ一覧\n株式(現物/特定預り)\n銘柄(コード),数量,取得単価",
])("rejects damaged portfolio headers without replacing saved holdings: %s", (csv) => {
  const original = importSbiFiles(
    [{ name: "original.csv", bytes: portfolioUtf8 }],
    { version: 1 },
    new Date("2026-10-27T00:00:00Z"),
  ).saved;
  const result = importSbiFiles(
    [{ name: "damaged.csv", bytes: new TextEncoder().encode(csv) }],
    original,
    new Date("2026-10-28T00:00:00Z"),
  );
  expect(result).toMatchObject({
    saved: original,
    files: [{ fileName: "damaged.csv", kind: "portfolio", error: expect.any(String) }],
  });
});

it("accepts an empty portfolio when its cash holdings header is complete", () => {
  const result = importSbiFiles(
    [{ name: "empty.csv", bytes: new TextEncoder().encode("ポートフォリオ一覧\n株式(現物/特定預り)\n銘柄(コード),数量,取得単価,現在値") }],
    { version: 1 },
    new Date("2026-10-28T00:00:00Z"),
  );
  expect(result).toEqual({
    saved: { version: 1, sbiPortfolio: { uploadedAt: "2026-10-28T00:00:00.000Z", holdings: [], notices: [] } },
    files: [{ fileName: "empty.csv", kind: "portfolio", notices: [] }],
  });
});
