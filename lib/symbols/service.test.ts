import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSymbolService } from "./service.ts";
import type { SymbolEntry, SymbolIndexFile } from "./types.ts";

const samsung: SymbolEntry = { market: "KR", code: "005930", name: "삼성전자", aliases: [], exchange: "코스피" };
const newIpo: SymbolEntry = { market: "KR", code: "0099X0", name: "삼성신규상장", aliases: [], exchange: "코스피" };

function fakeDownload(clock: () => Date) {
  let calls = 0;
  let fail = false;
  let entries = [samsung];
  return {
    download: async (): Promise<SymbolIndexFile> => {
      calls++;
      await Promise.resolve();
      if (fail) throw new Error("HTTP 503");
      return { version: 1, fetchedAt: clock().toISOString(), warnings: [], entries };
    },
    calls: () => calls,
    setFail: (v: boolean) => (fail = v),
    setEntries: (e: SymbolEntry[]) => (entries = e),
  };
}

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "trizon-symbols-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function clock(start: string) {
  let t = new Date(start).getTime();
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
}

/** 뒤에서 도는 갱신(다운로드 → 파일 쓰기)이 끝나기를 기다린다 */
async function eventually(check: () => Promise<boolean>) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail("시간 안에 조건을 만족하지 않았습니다");
}

const names = (r: Awaited<ReturnType<ReturnType<typeof createSymbolService>["search"]>>) => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.hits.map((h) => h.name);
};

test("처음 검색할 때 한 번 받아 저장하고, 새로 띄운 서버는 파일에서 읽는다", () =>
  withTempDir(async (dir) => {
    const c = clock("2026-09-27T00:00:00Z");
    const d = fakeDownload(c.now);
    const cachePath = join(dir, "symbols.json");
    const svc = createSymbolService({ cachePath, download: d.download, now: c.now });

    // 동시에 들어온 첫 검색들도 한 번만 받는다
    const [a, b] = await Promise.all([svc.search("삼성"), svc.search("005930")]);
    assert.deepEqual(names(a), ["삼성전자"]);
    assert.deepEqual(names(b), ["삼성전자"]);
    assert.equal(d.calls(), 1);
    assert.equal((JSON.parse(await readFile(cachePath, "utf8")) as SymbolIndexFile).entries.length, 1);

    const restarted = createSymbolService({ cachePath, download: d.download, now: c.now });
    assert.deepEqual(names(await restarted.search("삼성")), ["삼성전자"]);
    assert.equal(d.calls(), 1);
  }));

test("하루가 지나면 옛 목록으로 답하면서 뒤에서 새로 받는다", () =>
  withTempDir(async (dir) => {
    const c = clock("2026-09-27T00:00:00Z");
    const d = fakeDownload(c.now);
    const svc = createSymbolService({ cachePath: join(dir, "symbols.json"), download: d.download, now: c.now });
    await svc.search("삼성");

    d.setEntries([samsung, newIpo]);
    c.advance(24 * 60 * 60_000);
    assert.deepEqual(names(await svc.search("삼성")), ["삼성전자"]);
    assert.equal(d.calls(), 2);
    await eventually(async () => names(await svc.search("삼성")).length === 2);
    assert.deepEqual(names(await svc.search("삼성")), ["삼성전자", "삼성신규상장"]);
    assert.equal(d.calls(), 2);
  }));

test("목록이 없는데 받기에 실패하면 오류를 알리고, 1분 동안은 다시 두드리지 않는다", () =>
  withTempDir(async (dir) => {
    const c = clock("2026-09-27T00:00:00Z");
    const d = fakeDownload(c.now);
    d.setFail(true);
    const svc = createSymbolService({ cachePath: join(dir, "symbols.json"), download: d.download, now: c.now });

    const first = await svc.search("삼성");
    assert.equal(first.ok, false);
    assert.match(!first.ok ? first.error : "", /종목 목록을 받지 못했습니다 \(HTTP 503\)/);
    assert.equal((await svc.search("삼성")).ok, false);
    assert.equal(d.calls(), 1);

    d.setFail(false);
    c.advance(60_000);
    assert.deepEqual(names(await svc.search("삼성")), ["삼성전자"]);
    assert.equal(d.calls(), 2);
  }));

test("옛 목록이 있으면 새로 받기에 실패해도 계속 검색된다", () =>
  withTempDir(async (dir) => {
    const c = clock("2026-09-27T00:00:00Z");
    const d = fakeDownload(c.now);
    const svc = createSymbolService({ cachePath: join(dir, "symbols.json"), download: d.download, now: c.now });
    await svc.search("삼성");

    d.setFail(true);
    c.advance(25 * 60 * 60_000);
    assert.deepEqual(names(await svc.search("삼성")), ["삼성전자"]);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(names(await svc.search("삼성")), ["삼성전자"]);
    assert.equal(d.calls(), 2);
  }));
