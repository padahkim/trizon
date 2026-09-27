import { test } from "node:test";
import assert from "node:assert/strict";
import { jpEntries, parseJpxSheet, parseKisKrMaster, parseKisOverseasMaster, usEntries, type KisOverseasRow } from "./parse.ts";

/** KIS 국내 마스터 한 줄: 단축코드(9) + 표준코드(12) + 한글명 + 뒷부분(그룹코드 2자 … 시가총액 9자 + 6자) */
const krLine = (code: string, name: string, group: string, tail: number, { pad = 6, cap = 0 } = {}) =>
  `${code.padEnd(9)}KR7${code.padEnd(9, "0")}${name}${" ".repeat(pad)}${group}${"0".repeat(tail - 17)}${String(cap).padStart(9, "0")}000000`;

test("KIS 국내: 뒤에서부터 잘라 한글명·그룹을 읽고, 수익증권·신주인수권은 뺀다", () => {
  const text = [
    krLine("005930", "삼성전자", "ST", 227, { cap: 16_164_960 }),
    krLine("069500", "KODEX 200", "EF", 227),
    // 이름이 폭을 꽉 채워 뒷부분과 바로 붙은 줄
    krLine("0177N0", "TIGER 미국배당다우존스타겟데일리커버드콜", "EF", 227, { pad: 0 }),
    krLine("F70100030", "한투한미핵심성장포커스1(A)", "BC", 227),
    krLine("J00001", "어떤회사 1WR", "SW", 227),
    "",
  ].join("\r\n");
  const rows = parseKisKrMaster(text, "코스피");
  assert.deepEqual(
    rows.map((r) => [r.code, r.name, r.kind ?? null, r.exchange, r.tier ?? null]),
    [
      ["005930", "삼성전자", null, "코스피", 1],
      ["069500", "KODEX 200", "ETF", "코스피", null],
      ["0177N0", "TIGER 미국배당다우존스타겟데일리커버드콜", "ETF", "코스피", null],
    ],
  );
  // 시가총액(억원) → 규모: 100조 이상 1, 10조 이상 2, 1조 이상 3, 그 밖 4
  const caps = [1_000_000, 999_999, 100_000, 10_000, 9_999];
  const kosdaq = parseKisKrMaster(caps.map((cap, i) => krLine(`90000${i}`, `회사${i}`, "ST", 221, { cap })).join("\n"), "코스닥");
  assert.deepEqual(kosdaq.map((r) => r.tier), [1, 2, 2, 3, 4]);
});

const tsv = (...rows: string[][]) => rows.map((r) => r.join("\t")).join("\n");
const kisRow = (ex: string, symbol: string, ko: string, en: string, type: string) =>
  ["US", "22", "NAS", ex, symbol, `X${symbol}`, ko, en, type, "USD", "4", ""];

test("KIS 해외 → 미국: 클래스 주식만 BRK.B 로, 우선주·유닛·지수는 뺀다", () => {
  const rows = parseKisOverseasMaster(
    tsv(
      kisRow("나스닥", "NVDA", "엔비디아", "NVIDIA CORP", "2"),
      kisRow("나스닥", "QQQ", "INVESCO QQQ TRUST", "INVESCO QQQ TRUST UNIT SER 1", "3"),
      kisRow("뉴욕", "BRK/B", "버크셔 해서웨이 B", "BERKSHIRE HATHAWAY INC", "2"),
      kisRow("뉴욕", "ABR/D", "아버 리얼티 트러스트 우선주 D(6.375% 누적 상환)", "ARBOR REALTY TRUST", "2"),
      kisRow("뉴욕", "AAC/UN", "아레스 애퀴지션 III 유닛", "ARES ACQUISITION UNITS", "2"),
      kisRow("뉴욕", "ACP/A", "ABERDEEN FUND PREFERRED A", "ABERDEEN FUND PREFERRED A", "2"),
      kisRow("나스닥", "COMP", "나스닥 종합", "NASDAQ COMPOSITE", "1"),
    ),
  );
  assert.deepEqual(
    usEntries(rows).map((e) => [e.code, e.name, e.aliases, e.kind ?? null]),
    [
      ["NVDA", "엔비디아", ["NVIDIA CORP"], null],
      ["QQQ", "INVESCO QQQ TRUST", ["INVESCO QQQ TRUST UNIT SER 1"], "ETF"],
      ["BRK.B", "버크셔 해서웨이 B", ["BERKSHIRE HATHAWAY INC"], null],
    ],
  );
});

test("일본: JPX 日本語名 + KIS 한글·영문명을 코드로 합치고, JPX 에 없는 신규 상장은 KIS 로 채운다", () => {
  const kis: KisOverseasRow[] = [
    { exchange: "도쿄", symbol: "7203", ko: "도요타자동차", en: "TOYOTA MOTOR CORPORATION", type: "2" },
    { exchange: "도쿄", symbol: "1306", ko: "NOMURA TOPIX", en: "TOPIX EXCHANGE TRADED FUND", type: "3" },
    { exchange: "도쿄", symbol: "999A", ko: "신규상장", en: "NEW LISTING INC", type: "2" },
  ];
  const jpx = [
    { code: "7203", name: "トヨタ自動車", section: "プライム（内国株式）", size: "1" },
    { code: "1306", name: "ＮＥＸＴ　ＦＵＮＤＳ　ＴＯＰＩＸ連動型上場投信", section: "ETF・ETN", size: "-" },
    { code: "8951", name: "日本ビルファンド投資法人", section: "REIT・ベンチャーファンド・カントリーファンド・インフラファンド", size: "-" },
    { code: "3116", name: "トヨタ紡織", section: "プライム（内国株式）", size: "4" },
    { code: "1400", name: "プロ銘柄", section: "PRO Market", size: "-" },
  ];
  assert.deepEqual(
    jpEntries(jpx, kis).map((e) => [e.code, e.name, e.aliases, e.kind ?? null, e.tier ?? null]),
    [
      ["7203", "トヨタ自動車", ["도요타자동차", "TOYOTA MOTOR CORPORATION"], null, 1],
      ["1306", "ＮＥＸＴ　ＦＵＮＤＳ　ＴＯＰＩＸ連動型上場投信", ["NOMURA TOPIX", "TOPIX EXCHANGE TRADED FUND"], "ETF", null],
      ["8951", "日本ビルファンド投資法人", [], "리츠", null],
      ["3116", "トヨタ紡織", [], null, 3],
      ["999A", "신규상장", ["NEW LISTING INC"], null, null],
    ],
  );
  // JPX 를 못 받아도 KIS 만으로 목록이 만들어진다
  assert.equal(jpEntries([], kis).find((e) => e.code === "7203")?.name, "도요타자동차");
});

test("JPX xlsx: 공유 문자열·숫자 셀·빈 셀·엔티티, 열은 머리글로 찾는다", () => {
  const shared = `<sst><si><t>日付</t></si><si><t>コード</t></si><si><t>銘柄名</t></si><si><t>市場・商品区分</t></si>
    <si><r><t>トヨタ</t></r><r><t xml:space="preserve">自動車</t></r></si><si><t>プライム（内国株式）</t></si>
    <si><t>Ｋ＆Ｏエナジー &amp; Co</t></si><si><t>285A</t></si><si><t>規模コード</t></si><si><t>-</t></si></sst>`;
  const sheet = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="I1" t="s"><v>8</v></c></row>
    <row r="2"><c r="A2"><v>20260831</v></c><c r="B2"><v>7203</v></c><c r="C2" t="s"><v>4</v></c><c r="D2" t="s"><v>5</v></c><c r="I2"><v>1</v></c></row>
    <row r="3"><c r="A3" s="1"/><c r="B3" t="s"><v>7</v></c><c r="C3" t="s"><v>6</v></c><c r="D3" t="s"><v>5</v></c><c r="I3" t="s"><v>9</v></c></row>
    <row r="4"><c r="A4"><v>20260831</v></c><c r="C4" t="inlineStr"><is><t>코드 없음</t></is></c></row>
  </sheetData></worksheet>`;
  assert.deepEqual(parseJpxSheet(shared, sheet), [
    { code: "7203", name: "トヨタ自動車", section: "プライム（内国株式）", size: "1" },
    { code: "285A", name: "Ｋ＆Ｏエナジー & Co", section: "プライム（内国株式）", size: "-" },
  ]);
  assert.throws(() => parseJpxSheet("<sst/>", "<sheetData><row r=\"1\"></row></sheetData>"), /머리글/);
});
