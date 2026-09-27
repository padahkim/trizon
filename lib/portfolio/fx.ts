import type { Currency } from "../domain/model.ts";

/** 1 USD 당 각 통화 금액. USD 는 항상 1 (USD 를 기준으로 교차 환산한다). */
export type FxRates = Record<Currency, number>;

export function makeRates(usdKrw: number, usdJpy: number): FxRates {
  if (!(usdKrw > 0) || !(usdJpy > 0)) throw new Error(`환율 값이 올바르지 않습니다: KRW=${usdKrw}, JPY=${usdJpy}`);
  return { USD: 1, KRW: usdKrw, JPY: usdJpy };
}

export function convert(amount: number, from: Currency, to: Currency, rates: FxRates): number {
  if (from === to) return amount;
  return (amount / rates[from]) * rates[to];
}

/** 1 from = ? to */
export function crossRate(from: Currency, to: Currency, rates: FxRates): number {
  return convert(1, from, to, rates);
}
