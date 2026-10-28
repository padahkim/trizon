import { expect, it } from "vitest";
import { formatMoney, formatPercent, formatUploadedAt } from "./format";

it("formats currency precision, signs after rounding, and upload age against an injected clock", () => {
  expect(formatMoney(12000, "JPY")).toBe("¥12,000");
  expect(formatMoney(2000, "JPY", true)).toBe("+¥2,000");
  expect(formatMoney(-1000, "JPY", true)).toBe("-¥1,000");
  expect(formatMoney(-0.004, "USD", true)).toBe("0");
  expect(formatMoney(-18, "USD", true)).toBe("-$18.00");
  expect(formatMoney(1234000, "KRW")).toBe("₩1,234,000");
  expect(formatPercent(20)).toBe("+20.00%");
  expect(formatPercent(-0.001)).toBe("0.00%");
  expect(formatUploadedAt("2026-10-25T09:00:00Z", new Date("2026-10-28T09:00:00Z"))).toBe("3일 전");
  expect(formatUploadedAt("2026-10-28T08:59:00Z", new Date("2026-10-28T09:00:00Z"))).toBe("0일 전");
  expect(formatUploadedAt("2026-10-20T09:00:00Z", new Date("2026-10-28T09:00:00Z"))).toBe("2026.10.20");
});
