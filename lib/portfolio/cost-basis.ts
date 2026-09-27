import type { Currency } from "../domain/model.ts";

// 해외 종목의 "계좌통화 기준 매입금액" 입력 규칙과 실수 방지 가드.
// 저장은 항상 총액. SBI 는 1주당(取得単価 円換算)으로 보여주므로 입력만 1주당을 받는다.

export type CostBasisResult =
  | { ok: true; costBasisHome: number | undefined }
  | { ok: false; error: string };

export function resolveCostBasisHome(args: {
  tradeCurrency: Currency;
  homeCurrency: Currency;
  quantity: number;
  mode: "total" | "perShare";
  amount: number | undefined;
  unknown: boolean;
}): CostBasisResult {
  const { tradeCurrency, homeCurrency, quantity, mode, amount, unknown } = args;
  // 국내 종목은 평균단가 × 수량이 곧 매입금액이다
  if (tradeCurrency === homeCurrency) return { ok: true, costBasisHome: undefined };
  if (unknown) return { ok: true, costBasisHome: undefined };
  if (amount === undefined) {
    return { ok: false, error: `${homeCurrency} 기준 매입금액을 입력하거나 '모름'을 체크하세요` };
  }
  return { ok: true, costBasisHome: mode === "perShare" ? amount * quantity : amount };
}

/** 평균 매입환율: 거래통화 1단위당 계좌통화 금액 (예: 1,352원/$). 계산 불가면 null */
export function impliedFxRate(costBasisHome: number, quantity: number, avgCost: number): number | null {
  const costTrade = quantity * avgCost;
  if (!(costTrade > 0) || !(costBasisHome > 0)) return null;
  return costBasisHome / costTrade;
}

/** 평균 매입환율이 현재 환율과 tolerance 넘게 벌어졌으면 true — 추가 매수 뒤 매입금액 갱신을 잊은 경우 */
export function isFxRateSuspicious(implied: number, current: number, tolerance = 0.25): boolean {
  if (!(implied > 0) || !(current > 0)) return false;
  return Math.abs(implied / current - 1) > tolerance;
}

/** 일부 매도 반영: 이동평균법에서는 평균단가가 그대로이고 매입금액만 수량 비율로 줄어든다 */
export function scaleCostBasis(costBasisHome: number, oldQuantity: number, newQuantity: number): number {
  if (!(oldQuantity > 0)) return costBasisHome;
  return (costBasisHome * newQuantity) / oldQuantity;
}
