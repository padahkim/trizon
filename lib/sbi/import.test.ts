import { expect, it } from "vitest";
import { importSbiFiles } from "./import";
import { portfolioShiftJis, portfolioUtf8 } from "./fixtures";
import type { SavedV1 } from "../portfolio/saved";

it("identifies contents despite arbitrary filenames, imports multiple files, and replaces only the portfolio snapshot and timestamp", () => {
  const original: SavedV1 = { version: 1, sbiUsTrades: { uploadedAt: "2026-10-20T00:00:00.000Z", trades: [] } };
  const first = importSbiFiles([{ name: "renamed.txt", bytes: portfolioShiftJis }, { name: "also-renamed.csv", bytes: portfolioUtf8 }], original, new Date("2026-10-27T00:00:00Z"));
  expect(first.files).toEqual([
    { fileName: "renamed.txt", kind: "portfolio", notices: [] },
    { fileName: "also-renamed.csv", kind: "portfolio", notices: [] },
  ]);
  expect(first.saved.sbiPortfolio?.holdings).toHaveLength(2);
  const second = importSbiFiles([{ name: "anything", bytes: new TextEncoder().encode('ポートフォリオ一覧\n株式(現物/NISA預り)\n銘柄(コード),数量,取得単価,現在値\n1111 JP-A,10,1000,1200') }], first.saved, new Date("2026-10-28T00:00:00Z"));
  expect(second.saved.sbiPortfolio?.uploadedAt).toBe("2026-10-28T00:00:00.000Z");
  expect(second.saved.sbiPortfolio?.holdings).toHaveLength(1);
  expect(second.saved.sbiPortfolio?.holdings[0].account).toBe("NISA");
  expect(second.saved.sbiUsTrades).toEqual(original.sbiUsTrades);
  expect(original.sbiPortfolio).toBeUndefined();
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
