import { readFile } from "node:fs/promises";
import type { Market } from "../domain/model.ts";
import { isNotFound, writeFileAtomic } from "../store/fs-utils.ts";
import { prepareIndex, searchSymbols, type PreparedIndex } from "./search.ts";
import type { SymbolEntry, SymbolIndexFile } from "./types.ts";

export type SymbolSearchResult =
  | { ok: true; hits: SymbolEntry[]; fetchedAt: string; warnings: string[] }
  | { ok: false; error: string };

export type SymbolService = ReturnType<typeof createSymbolService>;

/**
 * 종목 검색 목록 캐시.
 * - 처음 검색할 때 data/symbols.json 을 읽고, 없으면 받아서 저장한다 (이때만 몇 초 걸린다).
 * - 하루가 지나면 옛 목록으로 계속 검색하면서 뒤에서 새로 받는다 (신규 상장 반영).
 * - 받기에 실패하면 1분 동안은 다시 시도하지 않는다.
 */
export function createSymbolService(opts: {
  cachePath: string;
  download: () => Promise<SymbolIndexFile>;
  maxAgeMs?: number;
  now?: () => Date;
}) {
  const maxAgeMs = opts.maxAgeMs ?? 24 * 60 * 60_000;
  const now = opts.now ?? (() => new Date());
  const RETRY_AFTER_FAILURE_MS = 60_000;

  let current: { file: SymbolIndexFile; index: PreparedIndex } | undefined;
  let diskLoad: Promise<void> | undefined;
  let inflight: Promise<void> | undefined;
  let failedAtMs = -Infinity;
  let lastError = "";

  function use(file: SymbolIndexFile) {
    current = { file, index: prepareIndex(file.entries) };
  }

  // 동시에 들어온 첫 검색들이 파일을 한 번만 읽도록 promise 를 공유한다
  function loadDisk(): Promise<void> {
    diskLoad ??= (async () => {
      try {
        const file = JSON.parse(await readFile(opts.cachePath, "utf8")) as SymbolIndexFile;
        if (file.version === 1 && Array.isArray(file.entries)) use(file);
      } catch (err) {
        // 없거나 깨졌으면 새로 받는다 (다시 받을 수 있는 파일)
        if (!isNotFound(err) && !(err instanceof SyntaxError)) throw err;
      }
    })();
    return diskLoad;
  }

  function refresh(): Promise<void> {
    inflight ??= (async () => {
      try {
        const file = await opts.download();
        await writeFileAtomic(opts.cachePath, JSON.stringify(file));
        use(file);
      } catch (err) {
        failedAtMs = now().getTime();
        lastError = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        inflight = undefined;
      }
    })();
    return inflight;
  }

  async function ensure(): Promise<{ file: SymbolIndexFile; index: PreparedIndex }> {
    await loadDisk();
    const nowMs = now().getTime();
    const coolingDown = nowMs - failedAtMs < RETRY_AFTER_FAILURE_MS;
    if (current) {
      const stale = nowMs - (Date.parse(current.file.fetchedAt) || 0) >= maxAgeMs;
      if (stale && !coolingDown) refresh().catch(() => undefined);
      return current;
    }
    if (coolingDown && !inflight) throw new Error(lastError);
    await refresh();
    return current!;
  }

  return {
    async search(query: string, preferMarket?: Market): Promise<SymbolSearchResult> {
      try {
        const { file, index } = await ensure();
        return { ok: true, hits: searchSymbols(index, query, { preferMarket }), fetchedAt: file.fetchedAt, warnings: file.warnings };
      } catch (err) {
        return { ok: false, error: `종목 목록을 받지 못했습니다 (${err instanceof Error ? err.message : String(err)})` };
      }
    },
  };
}
