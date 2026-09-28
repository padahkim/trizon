import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSbiImportStore, SbiImportFileError, type SbiImport } from "./store.ts";

const entry = (fileName: string): SbiImport => ({ fileName, fileModifiedAt: null, importedAt: "2026-09-28T00:00:00.000Z", text: "x" });

async function withDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "trizon-sbi-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("파일이 없으면 빈 값, 넣은 종류만 바꾸고 지운다", () =>
  withDir(async (dir) => {
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
    assert.equal(JSON.parse(await readFile(path, "utf8")).version, 1);
  }));

test("깨진 파일은 덮어쓰지 않는다", () =>
  withDir(async (dir) => {
    const path = join(dir, "sbi-imports.json");
    await writeFile(path, "{ broken", "utf8");
    const store = createSbiImportStore(path);
    await assert.rejects(store.load(), SbiImportFileError);
    await assert.rejects(store.put({ realized: entry("a.csv") }), SbiImportFileError);
    assert.equal(await readFile(path, "utf8"), "{ broken");

    await writeFile(path, JSON.stringify({ version: 1, imports: { realized: { fileName: 1 } } }), "utf8");
    await assert.rejects(store.load(), SbiImportFileError);
  }));
