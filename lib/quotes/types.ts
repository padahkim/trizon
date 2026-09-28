import type { FxRates } from "../portfolio/fx.ts";

export type Quote = {
  /** 조회 심볼 (005930.KS / 7203.T / AAPL) */
  symbol: string;
  price: number;
  /** 시세 통화 (Yahoo 의 currency 필드 그대로) */
  currency: string;
  /** 거래소 기준 시세 시각 (ISO) */
  marketTime: string;
  name?: string;
  /** 이번 조회가 실패해서 이전에 저장해 둔 값을 쓰는 중 */
  fromCache?: boolean;
  /** 시세 서버가 아니라 사용자가 가져온 파일의 값 (SBI CSV 의 투자신탁 기준가 등). provider 는 쓰지 않는다 */
  imported?: boolean;
};

export type FxQuote = {
  rates: FxRates;
  /** 환율 기준 시각 (ISO) */
  asOf: string;
  source: string;
  fromCache?: boolean;
};

/** 주가 조회. 못 찾은 심볼은 결과에서 빠진다. 네트워크/서버 오류는 throw. */
export interface QuoteProvider {
  readonly name: string;
  fetchQuotes(symbols: string[]): Promise<Record<string, Quote>>;
}

/** USD 기준 KRW·JPY 환율 조회. 실패 시 throw. */
export interface FxProvider {
  readonly name: string;
  fetchFx(): Promise<FxQuote>;
}
