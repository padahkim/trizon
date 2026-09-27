import { readFile } from "node:fs/promises";
import type { Currency } from "../domain/model.ts";
import { createSerialQueue, writeFileAtomic } from "../store/fs-utils.ts";
import { pickBestQuote, type ResolveResult } from "./resolve.ts";
import type { FxProvider, FxQuote, Quote, QuoteProvider } from "./types.ts";

export type MarketData = {
  /** 요청한 심볼 중 값이 있는 것 (이번 조회 실패분은 fromCache: true) */
  quotes: Record<string, Quote>;
  fx: FxQuote;
  /** 이번 조회에서 생긴 문제 (화면에 경고로 보여준다) */
  errors: string[];
};

export class NoFxError extends Error {
  constructor(details: string[]) {
    super(`환율을 가져오지 못했고 저장된 환율도 없습니다: ${details.join(" / ")}`);
    this.name = "NoFxError";
  }
}

type Entry<T> = { value: T; fetchedAtMs: number; lastAttemptFailed: boolean };
type CacheFile = {
  quotes?: Record<string, Quote & { fetchedAt: string }>;
  fx?: FxQuote & { fetchedAt: string };
};

export type QuoteService = ReturnType<typeof createQuoteService>;

/**
 * 시세·환율 조회 + 캐시.
 * - 메모리 캐시 TTL 동안은 다시 부르지 않는다 (기본 15분). invalidate() 로 강제 갱신.
 * - 조회에 실패하면 마지막 성공값(메모리 → data/quotes-cache.json)을 fromCache 표시와 함께 쓴다.
 * - 환율은 fxProviders 를 순서대로 시도한다 (Yahoo → Frankfurter).
 */
export function createQuoteService(opts: {
  quoteProvider: QuoteProvider;
  fxProviders: readonly FxProvider[];
  cachePath: string;
  ttlMs?: number;
  now?: () => Date;
}) {
  const ttlMs = opts.ttlMs ?? 15 * 60_000;
  const now = opts.now ?? (() => new Date());
  const serial = createSerialQueue();
  const quotes = new Map<string, Entry<Quote>>();
  let fx: Entry<FxQuote> | undefined;
  let diskLoaded = false;
  let forced = false;
  // 실패 직후 매 렌더마다 다시 두드리지 않도록 (429 를 악화시킨다)
  const RETRY_AFTER_FAILURE_MS = 60_000;
  let quotesFailedAtMs = -Infinity;
  let fxFailedAtMs = -Infinity;

  async function loadDisk() {
    if (diskLoaded) return;
    diskLoaded = true;
    try {
      const file = JSON.parse(await readFile(opts.cachePath, "utf8")) as CacheFile;
      for (const [symbol, { fetchedAt, ...quote }] of Object.entries(file.quotes ?? {})) {
        quotes.set(symbol, { value: quote, fetchedAtMs: Date.parse(fetchedAt) || 0, lastAttemptFailed: false });
      }
      if (file.fx) {
        const { fetchedAt, ...value } = file.fx;
        fx = { value, fetchedAtMs: Date.parse(fetchedAt) || 0, lastAttemptFailed: false };
      }
    } catch {
      // 캐시는 없어도 되는 파일 — 없거나 깨졌으면 빈 캐시로 시작한다
    }
  }

  async function saveDisk() {
    const file: CacheFile = { quotes: {} };
    for (const [symbol, e] of quotes) {
      file.quotes![symbol] = { ...e.value, fetchedAt: new Date(e.fetchedAtMs).toISOString() };
    }
    if (fx) file.fx = { ...fx.value, fetchedAt: new Date(fx.fetchedAtMs).toISOString() };
    await writeFileAtomic(opts.cachePath, `${JSON.stringify(file, null, 2)}\n`);
  }

  const expired = (e: Entry<unknown> | undefined, nowMs: number) => forced || !e || nowMs - e.fetchedAtMs >= ttlMs;

  async function refreshQuotes(symbols: string[], nowMs: number, errors: string[]): Promise<boolean> {
    const need = symbols.filter((s) => expired(quotes.get(s), nowMs));
    if (need.length === 0) return false;
    if (!forced && nowMs - quotesFailedAtMs < RETRY_AFTER_FAILURE_MS) {
      for (const s of need) {
        const prev = quotes.get(s);
        if (prev) prev.lastAttemptFailed = true;
      }
      errors.push("직전 시세 조회가 실패해 1분 동안은 저장된 시세를 씁니다");
      return false;
    }
    try {
      const got = await opts.quoteProvider.fetchQuotes(need);
      for (const s of need) {
        const q = got[s];
        const prev = quotes.get(s);
        if (q) quotes.set(s, { value: q, fetchedAtMs: nowMs, lastAttemptFailed: false });
        else if (prev) prev.lastAttemptFailed = true;
      }
      const missing = need.filter((s) => !got[s]);
      if (missing.length > 0) errors.push(`시세를 받지 못한 종목: ${missing.join(", ")}`);
      return true;
    } catch (err) {
      quotesFailedAtMs = nowMs;
      for (const s of need) {
        const prev = quotes.get(s);
        if (prev) prev.lastAttemptFailed = true;
      }
      errors.push(`시세 조회 실패 (${opts.quoteProvider.name}): ${message(err)}`);
      return false;
    }
  }

  async function refreshFx(nowMs: number, errors: string[]): Promise<boolean> {
    if (!expired(fx, nowMs)) return false;
    if (fx && !forced && nowMs - fxFailedAtMs < RETRY_AFTER_FAILURE_MS) {
      fx.lastAttemptFailed = true;
      return false;
    }
    const failures: string[] = [];
    for (const provider of opts.fxProviders) {
      try {
        fx = { value: await provider.fetchFx(), fetchedAtMs: nowMs, lastAttemptFailed: false };
        return true;
      } catch (err) {
        failures.push(`${provider.name}: ${message(err)}`);
      }
    }
    fxFailedAtMs = nowMs;
    if (fx) fx.lastAttemptFailed = true;
    errors.push(`환율 조회 실패 — ${failures.join(" / ")}`);
    if (!fx) throw new NoFxError(failures);
    return false;
  }

  return {
    get(symbols: readonly string[]): Promise<MarketData> {
      return serial(async () => {
        await loadDisk();
        const nowMs = now().getTime();
        const errors: string[] = [];
        const unique = [...new Set(symbols)];
        const [quotesChanged, fxChanged] = await Promise.all([
          refreshQuotes(unique, nowMs, errors),
          refreshFx(nowMs, errors),
        ]).finally(() => {
          forced = false;
        });
        if (quotesChanged || fxChanged) await saveDisk().catch((err) => errors.push(`시세 캐시 저장 실패: ${message(err)}`));

        const out: Record<string, Quote> = {};
        for (const s of unique) {
          const e = quotes.get(s);
          if (e) out[s] = { ...e.value, fromCache: e.lastAttemptFailed };
        }
        const fxEntry = fx as Entry<FxQuote>;
        return { quotes: out, fx: { ...fxEntry.value, fromCache: fxEntry.lastAttemptFailed }, errors };
      });
    },

    /** 종목 추가 시: 후보 심볼을 캐시 없이 조회해 실제로 거래되는 것을 고른다 */
    async resolve(candidates: readonly string[], expectedCurrency: Currency): Promise<ResolveResult> {
      let got: Record<string, Quote>;
      try {
        got = await opts.quoteProvider.fetchQuotes([...candidates]);
      } catch (err) {
        return { ok: false, error: `시세 서버가 응답하지 않습니다. 잠시 뒤 다시 시도하세요 (${message(err)})` };
      }
      const result = pickBestQuote(candidates, got, expectedCurrency, now());
      if (result.ok) {
        await serial(async () => {
          await loadDisk();
          quotes.set(result.quote.symbol, { value: result.quote, fetchedAtMs: now().getTime(), lastAttemptFailed: false });
        });
      }
      return result;
    },

    /** 다음 get() 에서 전부 다시 조회한다 (새로고침 버튼) */
    invalidate(): Promise<void> {
      return serial(async () => {
        forced = true;
      });
    },
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
