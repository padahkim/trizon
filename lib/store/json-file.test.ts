import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Holding } from "../domain/schema.ts";
import { createJsonFileStore } from "./json-file.ts";
import { seedPortfolio } from "./seed.ts";
import { PortfolioFileError } from "./types.ts";

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "trizon-store-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const holding: Holding = {
  id: "h1",
  accountId: "kb",
  market: "KR",
  code: "005930",
  quoteSymbol: "005930.KS",
  name: "삼성전자",
  quantity: 10,
  avgCost: 70_000,
  updatedAt: "2026-09-25T00:00:00Z",
};

test("파일이 없으면 seed 로 만든다", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "data", "portfolio.json");
    const file = await createJsonFileStore(path, seedPortfolio).load();
    assert.equal(file.accounts.length, 4);
    assert.equal(JSON.parse(await readFile(path, "utf8")).accounts.length, 4);
  }));

test("저장 후 다시 읽기 (새 인스턴스로)", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "portfolio.json");
    await createJsonFileStore(path, seedPortfolio).update((f) => ({ ...f, holdings: [holding] }));
    const reloaded = await createJsonFileStore(path, seedPortfolio).load();
    assert.deepEqual(reloaded.holdings, [holding]);
    // tmp 파일이 남지 않는다
    assert.deepEqual(await readdir(dir), ["portfolio.json"]);
  }));

test("동시 update 는 순서대로 처리되어 서로 덮어쓰지 않는다", () =>
  withTempDir(async (dir) => {
    const store = createJsonFileStore(join(dir, "portfolio.json"), seedPortfolio);
    await Promise.all(
      ["a", "b", "c"].map((id, i) =>
        store.update((f) => ({ ...f, holdings: [...f.holdings, { ...holding, id, quoteSymbol: `00000${i}.KS` }] })),
      ),
    );
    assert.deepEqual((await store.load()).holdings.map((h) => h.id), ["a", "b", "c"]);
  }));

test("스키마를 어기는 update 는 저장되지 않는다", () =>
  withTempDir(async (dir) => {
    const store = createJsonFileStore(join(dir, "portfolio.json"), seedPortfolio);
    await assert.rejects(store.update((f) => ({ ...f, holdings: [{ ...holding, accountId: "nope" }] })));
    assert.equal((await store.load()).holdings.length, 0);
  }));

test("깨진 파일은 에러로 알리고 절대 덮어쓰지 않는다", () =>
  withTempDir(async (dir) => {
    const path = join(dir, "portfolio.json");
    const broken = '{ "version": 1, "accounts": [ ';
    await writeFile(path, broken, "utf8");
    const store = createJsonFileStore(path, seedPortfolio);
    await assert.rejects(store.load(), PortfolioFileError);
    await assert.rejects(store.update((f) => f), PortfolioFileError);
    assert.equal(await readFile(path, "utf8"), broken);

    await writeFile(path, JSON.stringify({ version: 1, accounts: [], holdings: [holding] }), "utf8");
    await assert.rejects(store.load(), (err: unknown) => err instanceof PortfolioFileError && err.details.length > 0);
  }));
