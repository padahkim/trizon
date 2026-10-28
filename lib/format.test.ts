import { expect, it } from "vitest";
import { formatMoney, formatPercent, formatUploadedAt } from "./format";

it.each([
  { currency: "JPY", value: 12000, expected: "¥12,000" },
  { currency: "KRW", value: 1234000, expected: "₩1,234,000" },
] as const)("formats $currency as a whole amount", ({ currency, value, expected }) => {
  expect(formatMoney(value, currency)).toBe(expected);
});

it.each([
  { value: 2000, expected: "+¥2,000" },
  { value: -1000, expected: "-¥1,000" },
])("places the sign before the currency symbol for $value yen", ({ value, expected }) => {
  expect(formatMoney(value, "JPY", true)).toBe(expected);
});

it("keeps two decimal places in a dollar loss", () => {
  expect(formatMoney(-18, "USD", true)).toBe("-$18.00");
});

it("removes the sign when a dollar amount rounds to zero", () => {
  expect(formatMoney(-0.004, "USD", true)).toBe("0");
});

it("shows positive percentages with a sign and two decimal places", () => {
  expect(formatPercent(20)).toBe("+20.00%");
});

it("removes the sign when a percentage rounds to zero", () => {
  expect(formatPercent(-0.001)).toBe("0.00%");
});

it.each([
  { age: "three days old", uploadedAt: "2026-10-25T09:00:00Z", expected: "3일 전" },
  { age: "less than one day old", uploadedAt: "2026-10-28T08:59:00Z", expected: "0일 전" },
  { age: "more than one week old", uploadedAt: "2026-10-20T09:00:00Z", expected: "2026.10.20" },
])("formats an upload $age against an injected clock", ({ uploadedAt, expected }) => {
  expect(formatUploadedAt(uploadedAt, new Date("2026-10-28T09:00:00Z"))).toBe(expected);
});
