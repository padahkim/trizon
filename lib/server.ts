import "server-only";
import { join } from "node:path";
import { createFrankfurterProvider } from "./quotes/frankfurter.ts";
import { createQuoteService, type QuoteService } from "./quotes/service.ts";
import { createYahooProvider } from "./quotes/yahoo.ts";
import { createJsonFileStore } from "./store/json-file.ts";
import { seedPortfolio } from "./store/seed.ts";
import type { PortfolioStore } from "./store/types.ts";
import { createSymbolService, type SymbolService } from "./symbols/service.ts";
import { downloadSymbolIndex } from "./symbols/sources.ts";

// 서버 싱글턴. globalThis 에 두어 dev 핫리로드 때 시세 캐시와 쓰기 락이 초기화되지 않게 한다.
// `server-only` 는 이 파일에서만 import 한다 — lib/ 의 나머지는 node 테스트에서 그대로 돈다.

// TRIZON_DATA_DIR: 검증·실험용으로 다른 데이터 폴더를 쓸 때 (실제 자산 데이터와 섞이지 않게)
export const DATA_DIR = process.env.TRIZON_DATA_DIR || join(process.cwd(), "data");
export const SNAPSHOTS_PATH = join(DATA_DIR, "snapshots.jsonl");

type Singletons = { store: PortfolioStore; quotes: QuoteService; symbols: SymbolService };
const g = globalThis as typeof globalThis & { __trizon?: Singletons };

function singletons(): Singletons {
  if (!g.__trizon) {
    const yahoo = createYahooProvider();
    g.__trizon = {
      store: createJsonFileStore(join(DATA_DIR, "portfolio.json"), seedPortfolio),
      quotes: createQuoteService({
        quoteProvider: yahoo,
        fxProviders: [yahoo, createFrankfurterProvider()],
        cachePath: join(DATA_DIR, "quotes-cache.json"),
      }),
      symbols: createSymbolService({
        cachePath: join(DATA_DIR, "symbols.json"),
        download: () => downloadSymbolIndex(),
      }),
    };
  }
  return g.__trizon;
}

export const getStore = () => singletons().store;
export const getQuoteService = () => singletons().quotes;
export const getSymbolService = () => singletons().symbols;
