import type { Currency, Market } from "./portfolio/types";

function rounded(value: number, digits: number): number {
  const magnitude = Math.round((Math.abs(value) + Number.EPSILON) * 10 ** digits) / 10 ** digits;
  return magnitude === 0 ? 0 : Math.sign(value) * magnitude;
}

export function formatMoney(value: number, currency: Currency, signed = false): string {
  const digits = currency === "USD" ? 2 : 0;
  const amount = rounded(value, digits);
  if (signed && amount === 0) return "0";
  const symbol = { JPY: "¥", USD: "$", KRW: "₩" }[currency];
  const sign = amount < 0 ? "-" : signed && amount > 0 ? "+" : "";
  return `${sign}${symbol}${Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatPercent(value: number): string {
  const amount = rounded(value, 2);
  return `${amount > 0 ? "+" : ""}${amount.toFixed(2)}%`;
}

export function formatUploadedAt(uploadedAt: string, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(uploadedAt).getTime()) / 86_400_000));
  return days <= 7 ? `${days}일 전` : uploadedAt.slice(0, 10).replaceAll("-", ".");
}

export function formatMarketTime(market: Market, marketTime: string): string {
  const { name, timeZone } = {
    JP: { name: "일본", timeZone: "Asia/Tokyo" },
    US: { name: "미국", timeZone: "America/New_York" },
    KR: { name: "한국", timeZone: "Asia/Seoul" },
  }[market];
  const time = new Date(marketTime).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${name} 시세 ${time}`;
}
