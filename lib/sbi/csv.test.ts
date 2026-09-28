import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeCsvBytes, findColumn, parseAmount, parseCsv, parseDate, parsePeriod } from "./csv.ts";

const hex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (b) => parseInt(b, 16));

test("Shift_JIS(CP932) 바이트를 읽는다", () => {
  // '"商品","合計"\n"ＮＴＴ","+1,000"\n' 를 CP932 로 인코딩한 바이트
  const bytes = hex("228fa49569222c228d878c76220a22826d82738273222c222b312c303030220a");
  assert.equal(decodeCsvBytes(bytes), '"商品","合計"\n"ＮＴＴ","+1,000"\n');
});

test("UTF-8(BOM 포함)으로 다시 저장한 파일도 읽는다", () => {
  const text = '"商品","合計"\n';
  const utf8 = new TextEncoder().encode(text);
  assert.equal(decodeCsvBytes(utf8), text);
  assert.equal(decodeCsvBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])), text);
});

test("CSV 행: 따옴표·끝 쉼표·빈 줄·CRLF, 全角은 半角으로", () => {
  const rows = parseCsv('"銘柄（コード）","数量",\r\n"9432 ＮＴＴ",700,\r\n\r\n"a,b","say ""hi"""\n"줄\n바꿈",1');
  assert.deepEqual(rows, [["銘柄(コード)", "数量"], ["9432 NTT", "700"], [], ["a,b", 'say "hi"'], ["줄\n바꿈", "1"]]);
});

test("금액: 부호·쉼표·소수, 숫자가 아니면 null", () => {
  assert.equal(parseAmount("+128,013"), 128_013);
  assert.equal(parseAmount("-1,134,344"), -1_134_344);
  assert.equal(parseAmount("6,487.71"), 6_487.71);
  assert.equal(parseAmount("0.00"), 0);
  assert.equal(parseAmount("----/--/--"), null);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount(undefined), null);
});

test("날짜·기간", () => {
  assert.equal(parseDate("2026/9/4"), "2026-09-04");
  assert.equal(parseDate("2026/09/10"), "2026-09-10");
  assert.equal(parseDate("----/--/--"), null);
  assert.deepEqual(parsePeriod("2021/8/1-2026/9/28"), { from: "2021-08-01", to: "2026-09-28" });
  assert.deepEqual(parsePeriod("2021/8/1~2026/9/28"), { from: "2021-08-01", to: "2026-09-28" });
  assert.equal(parsePeriod("すべて"), null);
});

test("열 찾기: 같은 이름 먼저, 없으면 '이름(…)'", () => {
  const header = ["銘柄(コード)", "損益(%)", "損益", "実現損益(税引前・円)"];
  assert.equal(findColumn(header, "損益"), 2);
  assert.equal(findColumn(header, "実現損益"), 3);
  assert.equal(findColumn(header, "評価額"), -1);
  assert.equal(findColumn(header, (h) => h.includes("コード")), 0);
});
