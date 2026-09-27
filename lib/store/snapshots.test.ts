import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeRates } from "../portfolio/fx.ts";
import { appendDailySnapshot, type DailySnapshot } from "./snapshots.ts";

const snap = (date: string, value = 100): DailySnapshot => ({
  date,
  recordedAt: `${date}T00:00:00Z`,
  fx: makeRates(1350, 150),
  accounts: [{ id: "kb", currency: "KRW", value, cost: 90 }],
  missingPrices: 0,
  stalePrices: 0,
});

test("하루 한 줄: 같은 날은 건너뛰고, 다음 날은 이어 쓴다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trizon-snap-"));
  try {
    const path = join(dir, "data", "snapshots.jsonl");
    assert.equal(await appendDailySnapshot(path, snap("2026-09-26")), true);
    assert.equal(await appendDailySnapshot(path, snap("2026-09-26", 999)), false);
    assert.equal(await appendDailySnapshot(path, snap("2026-09-27")), true);
    const lines = (await readFile(path, "utf8")).trimEnd().split("\n").map((l) => JSON.parse(l) as DailySnapshot);
    assert.deepEqual(lines.map((l) => l.date), ["2026-09-26", "2026-09-27"]);
    assert.equal(lines[0].accounts[0].value, 100);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("줄바꿈 없이 끝난 파일에도 새 줄로 이어 쓴다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trizon-snap-"));
  try {
    const path = join(dir, "snapshots.jsonl");
    await writeFile(path, JSON.stringify(snap("2026-09-25")), "utf8");
    await appendDailySnapshot(path, snap("2026-09-26"));
    assert.equal((await readFile(path, "utf8")).trimEnd().split("\n").length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
