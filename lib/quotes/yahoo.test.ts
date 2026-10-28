import { expect, it } from "vitest";
import { toYahooSymbol } from "./yahoo";

it.each([
  ["JP:7203", "7203.T"], ["JP:130A", "130A.T"],
  ["US:AAPL", "AAPL"], ["US:BRK.B", "BRK-B"],
] as const)("maps %s to Yahoo symbol %s", (key, symbol) => {
  expect(toYahooSymbol(key)).toBe(symbol);
});
