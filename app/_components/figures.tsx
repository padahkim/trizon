import type { Currency } from "@/lib/domain/model.ts";
import { formatMoney, formatPercent, type FormatMode } from "@/lib/format/money.ts";

// 손익 부호에 따른 색 (상승 빨강 / 하락 파랑). 부호 문자가 항상 같이 붙는다.
export function directionClass(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded > 0 ? "up" : rounded < 0 ? "down" : "";
}

export function Money(props: { amount: number; currency: Currency; mode?: FormatMode; signed?: boolean; colored?: boolean }) {
  const { amount, currency, mode = "compact", signed = false, colored = false } = props;
  return (
    <span className={`num ${colored ? directionClass(amount) : ""}`} title={formatMoney(amount, currency, "exact", { signed })}>
      {formatMoney(amount, currency, mode, { signed })}
    </span>
  );
}

export function Pct({ rate }: { rate: number | null }) {
  return <span className={`num ${directionClass(rate)}`}>{formatPercent(rate)}</span>;
}
