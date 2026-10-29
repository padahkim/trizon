import { describe, expect, it } from "vitest";
import { decodeCsv, findColumn, parseAmount, parseCsv } from "./csv";
import { portfolioCsv, portfolioShiftJis, portfolioUtf8 } from "./fixtures";

describe("SBI CSV public reader", () => {
  it("reads the fake portfolio as UTF-8 and Shift_JIS without losing Japanese headings", () => {
    expect(decodeCsv(portfolioUtf8)).toBe(portfolioCsv);
    expect(decodeCsv(portfolioShiftJis)).toBe(portfolioCsv);
  });
  it("keeps quoted commas, escaped quotes and newlines, normalizes cells, and retains blank table boundaries", () => {
    expect(parseCsv('\uFEFF銘柄,数量,,\r\n"  ＪＰ，""Ａ""\r\n株式会社  ",１０,,\r\n\r\n終わり,,,')).toEqual([
      { cells: ["銘柄", "数量"], line: 1 },
      { cells: ['JP,"A"\r\n株式会社', "10"], line: 2 },
      { cells: [], line: 4 },
      { cells: ["終わり"], line: 5 },
    ]);
    expect(findColumn(["数量(株)", "数量", "取得単価(円)"], "数量")).toBe(1);
    expect(findColumn(["数量(株)", "取得単価(円)"], "取得単価")).toBe(1);
  });
  it("reads full-width yen and decimals, separates currency, and rejects invalid numbers with a line number", () => {
    expect(parseAmount(" １，２００ 円 ", 7)).toEqual({ amount: 1200 });
    expect(parseAmount("100.0000USD", 7)).toEqual({ amount: 100, currency: "USD" });
    expect(parseAmount("-", 7)).toBeNull();
    expect(parseAmount("--", 7)).toBeNull();
    expect(() => parseAmount("12oops", 7)).toThrow("7행");
    expect(() => parseAmount("1.2.3", 8)).toThrow("8행");
  });
  it("rejects bytes that are neither valid UTF-8 nor Shift_JIS with fatal decoding", () => {
    expect(() => decodeCsv(new Uint8Array([0xff, 0xff]))).toThrow("인코딩");
  });
});
