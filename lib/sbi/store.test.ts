import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSbiImportStore, SbiImportFileError, sbiUsHoldingSchema, type SbiImport } from "./store.ts";

const entry = (fileName: string): SbiImport => ({ fileName, fileModifiedAt: null, importedAt: "2026-09-28T00:00:00.000Z", text: "x" });

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "trizon-sbi-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("파일이 없으면 빈 값, 넣은 종류만 바꾸고 지운다", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "data", "sbi-imports.json");
    const store = createSbiImportStore(path);
    assert.deepEqual(await store.load(), {});
    await store.put({ realized: entry("a.csv"), dividends: entry("b.csv") });
    await store.put({ realized: entry("c.csv") });
    const loaded = await store.load();
    assert.equal(loaded.realized?.fileName, "c.csv");
    assert.equal(loaded.dividends?.fileName, "b.csv");
    await store.remove("dividends");
    assert.deepEqual(Object.keys(await store.load()), ["realized"]);
    assert.equal(JSON.parse(await readFile(path, "utf8")).version, 2);
  }));

test("v1 파일을 읽고 다음 저장에서 v2로 올린다", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "sbi-imports.json");
    await writeFile(path, JSON.stringify({ version: 1, imports: { realized: entry("old.csv") } }), "utf8");
    const store = createSbiImportStore(path);
    assert.equal((await store.load()).realized?.fileName, "old.csv");
    await store.put({ dividends: entry("new.csv") });
    const json = JSON.parse(await readFile(path, "utf8"));
    assert.equal(json.version, 2);
    assert.equal(json.imports.realized.fileName, "old.csv");
  }));

test("미국주식 여러 CSV와 확인 잔고를 원자적으로 저장하고 지운다", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "sbi-imports.json");
    const store = createSbiImportStore(path);
    await store.updateUsTrades(() => ({
      files: [{ ...entry("trades.csv"), fingerprint: "abc" }],
      holdings: [
        { id: "us-aapl", ticker: "AAPL", name: "Apple", quantity: 2, avgCost: 100, costCurrency: "USD", accountType: "特定", source: "inferred" },
      ],
      needsReview: true,
      confirmedAt: null,
    }));
    assert.equal((await store.load()).usTrades?.holdings[0].ticker, "AAPL");
    await store.remove("usTrades");
    assert.equal((await store.load()).usTrades, undefined);
  }));

test("깨진 파일은 덮어쓰지 않는다", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "sbi-imports.json");
    await writeFile(path, "{ broken", "utf8");
    const store = createSbiImportStore(path);
    await assert.rejects(store.load(), SbiImportFileError);
    await assert.rejects(store.put({ realized: entry("a.csv") }), SbiImportFileError);
    assert.equal(await readFile(path, "utf8"), "{ broken");

    await writeFile(path, JSON.stringify({ version: 1, imports: { realized: { fileName: 1 } } }), "utf8");
    await assert.rejects(store.load(), SbiImportFileError);
  }));

test("보정 잔고의 티커는 폼과 같은 규칙으로 판정한다", () => {
  const row = { id: "us-brk", name: "Berkshire", quantity: 1, avgCost: 1, costCurrency: "USD", accountType: "特定", source: "manual" };
  assert.equal(sbiUsHoldingSchema.parse({ ...row, ticker: " brk.b " }).ticker, "BRK.B");
  for (const ticker of ["AAPL!", "7203", "ABCDEFGHIJK"]) assert.equal(sbiUsHoldingSchema.safeParse({ ...row, ticker }).success, false, ticker);
});
