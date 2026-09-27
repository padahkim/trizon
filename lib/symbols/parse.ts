import { quoteSymbolCandidates } from "../domain/symbols.ts";
import type { Market } from "../domain/model.ts";
import type { SymbolEntry } from "./types.ts";

// 종목 마스터 파서 — 네트워크 없이 테스트할 수 있게 텍스트/XML 만 받는다.
// 소스별 형식은 한국투자증권 open-trading-api 의 stocks_info/*.py 와 JPX 東証上場銘柄一覧(data_j.xlsx) 기준.

// ── KIS 국내 (kospi_code.mst / kosdaq_code.mst) ──────────────────────────────
// 고정폭 CP949: 단축코드(9) + 표준코드(12) + 한글명(가변) + 뒷부분(코스피 227자 / 코스닥 221자, 전부 ASCII).
// 한글명의 바이트 폭은 고정이지만 디코딩한 글자 수는 달라지므로 뒤에서부터 자른다.
// 뒷부분: 맨 앞 2자 = 증권그룹구분, 끝에서 15~6번째 9자 = 전일 기준 시가총액(억원).

const KR_TAIL = { 코스피: 227, 코스닥: 221 } as const;

/** 뒷부분 앞 2자리 = 증권그룹구분. 수익증권(BC)·신주인수권(SW·SR)은 뺀다 */
const KR_GROUPS: Record<string, string | undefined> = {
  ST: undefined,
  EF: "ETF",
  EN: "ETN",
  RT: "리츠",
  IF: "인프라펀드",
  MF: "펀드",
  PF: "펀드",
  DR: "DR",
  FS: "외국주",
};

export function parseKisKrMaster(text: string, exchange: keyof typeof KR_TAIL): SymbolEntry[] {
  const tail = KR_TAIL[exchange];
  const out: SymbolEntry[] = [];
  for (const line of splitLines(text)) {
    if (line.length <= 21 + tail) continue;
    const group = line.slice(line.length - tail, line.length - tail + 2);
    if (!(group in KR_GROUPS)) continue;
    const code = line.slice(0, 9).trim();
    const name = line.slice(21, line.length - tail).trim();
    if (!name || !isFormCode("KR", code)) continue;
    // 100조 이상 1 · 10조 이상 2 · 1조 이상 3 · 그 밖 4 — 일본 TOPIX 규모(Core30·Large70·Mid400·Small)와 대략 맞춘 구간
    const cap = Number(line.slice(-15, -6));
    const tier = !(cap > 0) ? undefined : cap >= 1_000_000 ? 1 : cap >= 100_000 ? 2 : cap >= 10_000 ? 3 : 4;
    out.push(entry({ market: "KR", code, name, aliases: [], exchange, kind: KR_GROUPS[group], tier }));
  }
  return out;
}

// ── KIS 해외 (nasmst / nysmst / amsmst / tsemst .cod) ─────────────────────────
// 탭 구분 CP949: [3] 거래소명 [4] 심볼 [6] 한글명 [7] 영문명 [8] 증권종류(1 지수, 2 주식, 3 ETP, 4 워런트)

export type KisOverseasRow = { exchange: string; symbol: string; ko: string; en: string; type: string };

export function parseKisOverseasMaster(text: string): KisOverseasRow[] {
  const out: KisOverseasRow[] = [];
  for (const line of splitLines(text)) {
    const c = line.split("\t");
    if (c.length < 9) continue;
    out.push({ exchange: c[3].trim(), symbol: c[4].trim(), ko: c[6].trim(), en: c[7].trim(), type: c[8].trim() });
  }
  return out;
}

// 슬래시 심볼(BRK/B, ABR/D, AAC/UN)은 클래스 주식만 남긴다 — 우선주·유닛은 Yahoo 표기가 달라 조회가 안 된다
const US_NOT_CLASS_SHARE = /우선주|유닛|워런트|권리|\bPREF|\bPFD\b|\bUNITS?\b|\bWARRANTS?\b|\bRIGHTS?\b/;

export function usEntries(rows: readonly KisOverseasRow[]): SymbolEntry[] {
  const out: SymbolEntry[] = [];
  for (const r of rows) {
    if (r.type !== "2" && r.type !== "3") continue;
    const [base, cls, ...rest] = r.symbol.split("/");
    if (cls !== undefined && (rest.length > 0 || !/^[A-Z]$/.test(cls) || US_NOT_CLASS_SHARE.test(`${r.ko} ${r.en}`))) continue;
    const code = cls === undefined ? base : `${base}.${cls}`;
    if (!isFormCode("US", code)) continue;
    const name = r.ko || r.en;
    if (!name) continue;
    out.push(entry({ market: "US", code, name, aliases: [r.en], exchange: r.exchange, kind: r.type === "3" ? "ETF" : undefined }));
  }
  return out;
}

// ── 일본: JPX 목록(日本語名) + KIS tsemst(한글명·영문명) ──────────────────────
// JPX 는 월 1회 갱신이라 그 뒤 상장 종목은 KIS 에만 있다 → 둘을 코드로 합친다.

/** size = 規模コード (1 TOPIX Core30, 2 Large70, 4 Mid400, 6 Small 1, 7 Small 2, - 그 외) */
export type JpxRow = { code: string; name: string; section: string; size: string };

const JPX_TIER: Record<string, 1 | 2 | 3 | 4 | undefined> = { "1": 1, "2": 2, "4": 3, "6": 4, "7": 4 };

export function jpEntries(jpx: readonly JpxRow[], kis: readonly KisOverseasRow[]): SymbolEntry[] {
  const kisByCode = new Map(kis.filter((r) => r.type === "2" || r.type === "3").map((r) => [r.symbol, r]));
  const out: SymbolEntry[] = [];
  const seen = new Set<string>();

  for (const j of jpx) {
    // PRO Market 은 특정투자자 전용 — 일반 계좌에서 살 수 없다
    if (j.section === "PRO Market" || !isFormCode("JP", j.code)) continue;
    const k = kisByCode.get(j.code);
    const kind = j.section.startsWith("ETF") ? "ETF" : j.section.startsWith("REIT") ? "리츠" : k?.type === "3" ? "ETF" : undefined;
    out.push(entry({ market: "JP", code: j.code, name: j.name, aliases: k ? [k.ko, k.en] : [], exchange: "도쿄", kind, tier: JPX_TIER[j.size] }));
    seen.add(j.code);
  }
  for (const k of kisByCode.values()) {
    if (seen.has(k.symbol) || !isFormCode("JP", k.symbol)) continue;
    const name = k.ko || k.en;
    if (!name) continue;
    out.push(entry({ market: "JP", code: k.symbol, name, aliases: [k.en], exchange: "도쿄", kind: k.type === "3" ? "ETF" : undefined }));
  }
  return out;
}

/** JPX data_j.xlsx 의 sharedStrings.xml + sheet1.xml → 행. 열은 위치가 아니라 머리글로 찾는다 */
export function parseJpxSheet(sharedStringsXml: string, sheetXml: string): JpxRow[] {
  const strings = [...sharedStringsXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1]));
  const rows: Record<string, string>[] = [];
  for (const row of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Record<string, string> = {};
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = /\br="([A-Z]+)\d+"/.exec(c[1])?.[1];
      if (!col || c[2] === undefined) continue;
      const type = /\bt="([^"]+)"/.exec(c[1])?.[1];
      const v = /<v>([^<]*)<\/v>/.exec(c[2])?.[1];
      cells[col] =
        type === "s" ? (strings[Number(v)] ?? "") : type === "inlineStr" ? xmlText(c[2]) : v === undefined ? "" : decodeXml(v);
    }
    rows.push(cells);
  }

  const header = rows[0] ?? {};
  const colOf = (label: string) => Object.keys(header).find((k) => header[k] === label);
  const codeCol = colOf("コード");
  const nameCol = colOf("銘柄名");
  const sectionCol = colOf("市場・商品区分");
  const sizeCol = colOf("規模コード"); // 없어도 된다 (정렬에만 쓴다)
  if (!codeCol || !nameCol || !sectionCol) throw new Error("JPX 목록의 머리글(コード·銘柄名·市場・商品区分)을 찾지 못했습니다");

  const cell = (r: Record<string, string>, col: string | undefined) => (col ? (r[col] ?? "") : "").trim();
  return rows
    .slice(1)
    .map((r) => ({ code: cell(r, codeCol), name: cell(r, nameCol), section: cell(r, sectionCol), size: cell(r, sizeCol) }))
    .filter((r) => r.code && r.name);
}

// ── 공용 ──────────────────────────────────────────────────────────────────

/** 폼이 받는 코드 형식인지 — 규칙은 lib/domain/symbols.ts 한 곳에 둔다 */
function isFormCode(market: Market, code: string): boolean {
  const r = quoteSymbolCandidates(market, code);
  return r.ok && r.code === code;
}

/** 별칭 중복·빈 값을 없애고, 값이 없는 kind·tier 는 키째 뺀다 (symbols.json 크기) */
function entry({ kind, tier, ...e }: SymbolEntry): SymbolEntry {
  const aliases = [...new Set(e.aliases.map((a) => a.trim()))].filter((a) => a && a !== e.name);
  return { ...e, aliases, ...(kind ? { kind } : {}), ...(tier ? { tier } : {}) };
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).filter((l) => l.trim() !== "");
}

function xmlText(fragment: string): string {
  return [...fragment.matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map((m) => decodeXml(m[1])).join("");
}

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const lower = e.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number(lower.slice(1)));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[lower] ?? _;
  });
}
