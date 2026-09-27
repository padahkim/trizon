import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareIndex, searchSymbols } from "./search.ts";
import type { SymbolEntry } from "./types.ts";

const e = (market: SymbolEntry["market"], code: string, name: string, aliases: string[] = [], kind?: string, tier?: SymbolEntry["tier"]): SymbolEntry => ({
  market,
  code,
  name,
  aliases,
  exchange: "",
  ...(kind ? { kind } : {}),
  ...(tier ? { tier } : {}),
});

const index = prepareIndex([
  e("KR", "005930", "삼성전자"),
  e("KR", "005935", "삼성전자우"),
  e("KR", "006400", "삼성SDI"),
  e("KR", "0177N0", "KODEX 삼성전자SK하이닉스채권혼합50", [], "ETF"),
  e("KR", "360750", "TIGER 미국S&P500", [], "ETF"),
  e("KR", "0167A0", "삼성 인버스 2X WTI원유 선물 ETN", [], "ETN"),
  e("JP", "7203", "トヨタ自動車", ["도요타자동차", "TOYOTA MOTOR CORPORATION"], undefined, 1),
  e("JP", "3116", "トヨタ紡織", ["토요타방직", "TOYOTA BOSHOKU CORPORATION"], undefined, 3),
  e("JP", "5310", "東洋炭素", ["도요탄소", "TOYO TANSO CO. LTD."], undefined, 4),
  e("JP", "1605", "ＩＮＰＥＸ", ["인펙스", "INPEX CORPORATION"]),
  e("US", "TM", "도요타 자동차 ADR", ["TOYOTA MOTOR CORP ADR"]),
  e("US", "NVDA", "엔비디아", ["NVIDIA CORP"]),
  e("US", "NVDL", "GRANITESHARES 2X LONG 엔비디아", [], "ETF"),
  e("US", "BRK.B", "버크셔 해서웨이 B", ["BERKSHIRE HATHAWAY INC"]),
]);

const codes = (q: string, preferMarket?: SymbolEntry["market"]) => searchSymbols(index, q, { preferMarket }).map((h) => h.code);

test("이름 일치 → 앞부분 일치 → 포함 순, 같은 순위면 보통주·짧은 이름 먼저", () => {
  assert.deepEqual(codes("삼성전자"), ["005930", "005935", "0177N0"]);
  // 앞부분 일치(보통주 → ETN) 다음에 포함(ETF)
  assert.deepEqual(codes("삼성"), ["005930", "005935", "006400", "0167A0", "0177N0"]);
  assert.deepEqual(codes("엔비디아"), ["NVDA", "NVDL"]);
});

test("일본어·한글·영문 별칭 어느 것으로도 찾고, 전각 문자·대소문자를 가리지 않는다", () => {
  assert.deepEqual(codes("トヨタ"), ["7203", "3116"]);
  assert.deepEqual(codes("도요타"), ["7203", "TM"]);
  assert.deepEqual(codes("inpex"), ["1605"]);
});

test("같은 순위면 고른 계좌의 시장 → 큰 회사 먼저 (이름이 더 짧아도 작은 회사는 뒤로)", () => {
  // TOYO TANSO 도 공백을 빼면 "toyota" 로 시작한다 — 이름 길이만 보면 東洋炭素(4자)가 맨 앞에 온다
  assert.deepEqual(codes("toyota", "JP"), ["7203", "3116", "5310", "TM"]);
  assert.deepEqual(codes("toyota", "US"), ["TM", "7203", "3116", "5310"]);
});

test("띄어 쓴 낱말은 순서와 상관없이 모두 들어 있으면 찾는다", () => {
  assert.deepEqual(codes("tiger s&p"), ["360750"]);
  assert.deepEqual(codes("s&p tiger"), ["360750"]);
  assert.deepEqual(codes("삼성 채권"), ["0177N0"]);
});

test("코드: 붙여 넣는 여러 표기를 받고, 코드 일치가 이름보다 앞선다", () => {
  assert.deepEqual(codes("005930"), ["005930"]);
  assert.deepEqual(codes("A005930"), ["005930"]);
  assert.deepEqual(codes("005930.KS"), ["005930"]);
  assert.deepEqual(codes("7203.t"), ["7203"]);
  assert.deepEqual(codes("brk-b"), ["BRK.B"]);
  assert.deepEqual(codes("BRK/B"), ["BRK.B"]);
  assert.deepEqual(codes("0059"), ["005930", "005935"]);
  assert.deepEqual(codes("nvd").slice(0, 2), ["NVDA", "NVDL"]);
});

test("빈 검색어·없는 이름은 빈 결과, limit 을 지킨다", () => {
  assert.deepEqual(codes("  "), []);
  assert.deepEqual(codes("없는회사"), []);
  assert.equal(searchSymbols(index, "삼성", { limit: 2 }).length, 2);
});
