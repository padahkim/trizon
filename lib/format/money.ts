import type { Currency } from "../domain/model.ts";

export type FormatMode = "compact" | "exact";

export const CURRENCY_SUFFIX: Record<Currency, string> = { KRW: "원", JPY: "엔", USD: "달러" };

const MAN = 10_000;
const EOK = 100_000_000;
const UNITS = [
  { size: 1_0000_0000_0000, label: "조" },
  { size: EOK, label: "억" },
  { size: MAN, label: "만" },
] as const;

const grouped = (n: number, maxFraction = 0, minFraction = 0) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits: maxFraction, minimumFractionDigits: minFraction });

/**
 * 금액 표시.
 * - compact(간략): 1억 이상은 만 단위로 반올림 → "1억 2,346만 원".
 *   1만~1억은 만 + 나머지 → "9만 2,346달러", "1,380만 엔". 1만 미만은 그대로 → "9,999원".
 * - exact(정확): "123,456,789원" / "92,345.67달러"
 * signed: 손익 표시용 — 양수에 "+" 를 붙인다.
 */
export function formatMoney(
  amount: number,
  currency: Currency,
  mode: FormatMode = "compact",
  opts: { signed?: boolean } = {},
): string {
  if (!Number.isFinite(amount)) return "—";
  const suffix = CURRENCY_SUFFIX[currency];
  const abs = Math.abs(amount);
  const body = mode === "exact" ? exactBody(abs, currency) + suffix : compactBody(abs, currency, suffix);
  const isZero = body === `0${suffix}` || body === `0.00${suffix}`;
  const sign = amount < 0 && !isZero ? "-" : opts.signed && amount > 0 && !isZero ? "+" : "";
  return sign + body;
}

function exactBody(abs: number, currency: Currency): string {
  return currency === "USD" ? grouped(abs, 2, 2) : grouped(Math.round(abs));
}

function compactBody(abs: number, currency: Currency, suffix: string): string {
  // 1만 미만: 원·엔은 정수, 달러는 센트까지
  if (currency === "USD" ? abs < MAN : Math.round(abs) < MAN) {
    return (currency === "USD" ? grouped(abs, 2) : grouped(Math.round(abs))) + suffix;
  }
  // 1억 미만: "9만 2,346달러" (정수 반올림 뒤 나눈다 — 99,999.6 → "10만 원")
  const n = Math.round(abs);
  if (n < EOK) {
    const man = Math.floor(n / MAN);
    const rest = n % MAN;
    return rest === 0 ? `${grouped(man)}만 ${suffix}` : `${grouped(man)}만 ${grouped(rest)}${suffix}`;
  }
  // 1억 이상: 만 단위로 반올림 후 조·억·만으로 나눈다 (199,995,000 → "2억 원")
  let remaining = Math.round(abs / MAN) * MAN;
  const parts: string[] = [];
  for (const unit of UNITS) {
    const q = Math.floor(remaining / unit.size);
    remaining -= q * unit.size;
    if (q > 0) parts.push(`${grouped(q)}${unit.label}`);
  }
  return `${parts.join(" ")} ${suffix}`;
}

/** 수익률: 0.1234 → "+12.34%". null → "—" */
export function formatPercent(rate: number | null, opts: { signed?: boolean } = { signed: true }): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  const pct = rate * 100;
  const text = Math.abs(pct).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (text === "0.00") return "0.00%";
  const sign = pct < 0 ? "-" : opts.signed ? "+" : "";
  return `${sign}${text}%`;
}

/** 1주 가격·평균단가: 원·엔은 소수 2자리까지, 달러는 2~4자리 */
export function formatUnitPrice(price: number, currency: Currency): string {
  if (!Number.isFinite(price)) return "—";
  const text = currency === "USD" ? grouped(price, 4, 2) : grouped(price, 2);
  return text + CURRENCY_SUFFIX[currency];
}

/** 수량: 소수점 주식 대비 6자리까지 */
export function formatQuantity(q: number): string {
  return grouped(q, 6);
}
