import { jpEntries, parseJpxSheet, parseKisKrMaster, parseKisOverseasMaster, usEntries, type JpxRow } from "./parse.ts";
import type { SymbolEntry, SymbolIndexFile } from "./types.ts";
import { unzip } from "./unzip.ts";

// 종목 목록 소스 (둘 다 키 불필요, 공개 다운로드)
// - 한국투자증권 종목 마스터: 매일 새벽 갱신. 국내는 한글명, 해외(미국·도쿄)는 한글명+영문명.
//   URL 출처: github.com/koreainvestment/open-trading-api stocks_info/*.py
// - JPX 東証上場銘柄一覧: 월 1회 갱신. 일본 종목의 日本語名 — 실패해도 KIS 한글명·영문명으로 검색된다.
const KIS_BASE = "https://new.real.download.dws.co.kr/common/master";
const JPX_URL = "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xlsx";

export async function downloadSymbolIndex(fetchImpl: typeof fetch = fetch): Promise<SymbolIndexFile> {
  const kis = (file: string) => fetchBytes(fetchImpl, `${KIS_BASE}/${file}.zip`).then((b) => cp949(firstEntry(unzip(b), file)));

  const [kospi, kosdaq, nas, nys, ams, tse, jpx] = await Promise.allSettled([
    kis("kospi_code.mst"),
    kis("kosdaq_code.mst"),
    kis("nasmst.cod"),
    kis("nysmst.cod"),
    kis("amsmst.cod"),
    kis("tsemst.cod"),
    fetchBytes(fetchImpl, JPX_URL).then(parseJpx),
  ]);

  // KIS 는 한·미 종목의 유일한 소스라 하나라도 빠지면 목록을 만들지 않는다 (반쪽 목록이 하루 동안 남지 않게)
  const required = { kospi, kosdaq, nas, nys, ams, tse };
  const failed = Object.entries(required).flatMap(([k, r]) => (r.status === "rejected" ? [`${k} ${reason(r)}`] : []));
  if (failed.length > 0) throw new Error(`한국투자증권 종목 마스터: ${failed.join(" / ")}`);
  const text = (r: PromiseSettledResult<string>) => (r as PromiseFulfilledResult<string>).value;

  const warnings: string[] = [];
  let jpxRows: JpxRow[] = [];
  if (jpx.status === "fulfilled") jpxRows = jpx.value;
  else warnings.push(`JPX 목록을 받지 못해 일본 종목은 한글·영문명으로만 검색됩니다 (${reason(jpx)})`);

  const entries: SymbolEntry[] = [
    ...parseKisKrMaster(text(kospi), "코스피"),
    ...parseKisKrMaster(text(kosdaq), "코스닥"),
    ...jpEntries(jpxRows, parseKisOverseasMaster(text(tse))),
    ...usEntries([nas, nys, ams].flatMap((r) => parseKisOverseasMaster(text(r)))),
  ];
  return { version: 1, fetchedAt: new Date().toISOString(), warnings, entries };
}

async function fetchBytes(fetchImpl: typeof fetch, url: string): Promise<Uint8Array> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function firstEntry(files: Map<string, Buffer>, expected: string): Buffer {
  // zip 안 파일명은 대소문자가 섞여 있다 (kospi_code.mst / NASMST.COD)
  for (const [name, data] of files) if (name.toLowerCase() === expected) return data;
  throw new Error(`zip 안에 ${expected} 가 없습니다`);
}

function parseJpx(bytes: Uint8Array): JpxRow[] {
  const files = unzip(bytes);
  const shared = files.get("xl/sharedStrings.xml");
  const sheet = files.get("xl/worksheets/sheet1.xml");
  if (!shared || !sheet) throw new Error("xlsx 형식이 바뀌었습니다");
  return parseJpxSheet(shared.toString("utf8"), sheet.toString("utf8"));
}

// WHATWG 의 "euc-kr" 디코더는 CP949(확장 완성형)까지 읽는다
const cp949 = (b: Buffer) => new TextDecoder("euc-kr").decode(b);

const reason = (r: PromiseRejectedResult) => (r.reason instanceof Error ? r.reason.message : String(r.reason));
