import type { Period, SbiDividends, SbiRealized } from "./types.ts";

export type SbiPeriodIssue = {
  kind: "different" | "unknown";
  realized: Period | null;
  dividends: Period | null;
};

/** 두 CSV가 모두 있을 때 누적손익의 기간을 서로 비교할 수 있는지 확인한다. */
export function sbiPeriodIssue(realized: SbiRealized | null, dividends: SbiDividends | null): SbiPeriodIssue | null {
  if (!realized || !dividends) return null;
  if (!realized.period || !dividends.period) {
    return { kind: "unknown", realized: realized.period, dividends: dividends.period };
  }
  if (realized.period.from !== dividends.period.from || realized.period.to !== dividends.period.to) {
    return { kind: "different", realized: realized.period, dividends: dividends.period };
  }
  return null;
}
