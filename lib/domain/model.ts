// 도메인 상수 — 의존성 없는 순수 값. 순수 로직(calc·fx·money)은 여기서 값을 가져오고,
// 타입은 schema.ts 에서 `import type` 으로만 가져온다 (node 테스트가 zod 없이도 돈다).

export const CURRENCIES = ["KRW", "JPY", "USD"] as const;
export const MARKETS = ["KR", "JP", "US"] as const;
export const BROKERS = ["KB", "NH", "TOSS", "SBI"] as const;

export type Currency = (typeof CURRENCIES)[number];
export type Market = (typeof MARKETS)[number];
export type Broker = (typeof BROKERS)[number];

/** 시장 → 거래통화. 계좌(증권사)와는 무관하다: SBI 의 韓国株도 KRW 로 거래된다. */
export const TRADE_CURRENCY: Record<Market, Currency> = {
  KR: "KRW",
  JP: "JPY",
  US: "USD",
};

export const MARKET_LABEL: Record<Market, string> = {
  KR: "한국",
  JP: "일본",
  US: "미국",
};

export const BROKER_LABEL: Record<Broker, string> = {
  KB: "KB증권",
  NH: "NH투자증권(나무)",
  TOSS: "토스증권",
  SBI: "SBI証券",
};

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}
