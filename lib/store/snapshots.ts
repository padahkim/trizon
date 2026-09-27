import { appendFile, readFile } from "node:fs/promises";
import type { Currency } from "../domain/model.ts";
import type { PortfolioView } from "../portfolio/calc.ts";
import type { FxRates } from "../portfolio/fx.ts";
import { createSerialQueue, isNotFound, writeFileAtomic } from "./fs-utils.ts";

/**
 * 일별 스냅샷 (data/snapshots.jsonl, 하루 한 줄).
 * 지나간 날의 총자산은 나중에 채울 수 없으므로 v1 부터 쌓는다. 환율을 같이 남겨서
 * 과거 어느 날이든 원·엔·달러 어느 통화로도 다시 보여줄 수 있게 한다.
 */
export type DailySnapshot = {
  /** 로컬 날짜 YYYY-MM-DD */
  date: string;
  recordedAt: string;
  fx: FxRates;
  accounts: { id: string; currency: Currency; value: number; cost: number }[];
  /** 가격 미확인·오래된 시세 종목 수 — 이 날 기록의 신뢰도 */
  missingPrices: number;
  stalePrices: number;
};

export function localDate(d: Date): string {
  // sv-SE 로캘은 YYYY-MM-DD 형식을 준다 (시스템 시간대 기준)
  return d.toLocaleDateString("sv-SE");
}

export function snapshotFromView(view: PortfolioView, fx: FxRates, now: Date): DailySnapshot {
  return {
    date: localDate(now),
    recordedAt: now.toISOString(),
    fx,
    accounts: view.accounts.map((a) => ({
      id: a.account.id,
      currency: a.account.homeCurrency,
      value: a.home.value,
      cost: a.home.cost,
    })),
    missingPrices: view.counts.missing,
    stalePrices: view.counts.stale,
  };
}

const serial = createSerialQueue();

/** 그날 기록이 이미 있으면 아무것도 하지 않는다. 기록했으면 true */
export function appendDailySnapshot(filePath: string, snapshot: DailySnapshot): Promise<boolean> {
  return serial(async () => {
    let text = "";
    try {
      text = await readFile(filePath, "utf8");
    } catch (err) {
      if (!isNotFound(err)) throw err;
      await writeFileAtomic(filePath, `${JSON.stringify(snapshot)}\n`);
      return true;
    }
    const lastLine = text.trimEnd().split("\n").at(-1);
    if (lastLine) {
      try {
        if ((JSON.parse(lastLine) as DailySnapshot).date === snapshot.date) return false;
      } catch {
        // 마지막 줄이 깨졌으면 그 뒤에 새 줄로 이어 쓴다 (기존 기록은 건드리지 않는다)
      }
    }
    const prefix = text === "" || text.endsWith("\n") ? "" : "\n";
    await appendFile(filePath, `${prefix}${JSON.stringify(snapshot)}\n`, "utf8");
    return true;
  });
}
