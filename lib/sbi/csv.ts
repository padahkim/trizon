import type { Period } from "./types.ts";

// SBI証券 CSV 공통 부분: 인코딩, 행 나누기, 숫자·날짜 읽기.

/** SBI 는 Shift_JIS(CP932)로 내려준다. 엑셀 등에서 UTF-8 로 다시 저장한 파일(BOM 포함)도 받는다. */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // WHATWG 의 shift_jis 디코더는 CP932 확장 문자(①, ㈱ 등)까지 읽는다
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

/**
 * CSV 텍스트 → 행 배열. 따옴표 안의 쉼표·줄바꿈과 "" 이스케이프를 처리한다.
 * - 셀은 NFKC 로 정규화한다: 全角 영숫자·괄호를 半角으로 ("ＮＴＴ" → "NTT", "銘柄（コード）" → "銘柄(コード)").
 * - SBI 는 행 끝에 쉼표를 붙이므로 끝의 빈 셀은 버린다. 빈 줄은 [] 로 남긴다 — 빈 줄로 표를 나누기 때문이다.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const endRow = () => {
    row.push(cell);
    rows.push(finishRow(row));
    row = [];
    cell = "";
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      endRow();
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

function finishRow(cells: string[]): string[] {
  const out = cells.map((c) => c.normalize("NFKC").trim());
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

/** "+1,234" "-5,678.9" "1,234円" → 숫자. 빈 칸, "-", "----/--/--" 처럼 숫자가 아니면 null */
export function parseAmount(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.replace(/[,\s円]/g, "");
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  return Number(t);
}

/** "2026/9/24" · "2026/09/24" → "2026-09-24". 날짜가 아니면 ("----/--/--") null */
export function parseDate(s: string | undefined): string | null {
  const m = s?.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

/** "2021/8/1-2026/9/28" → { from: "2021-08-01", to: "2026-09-28" } */
export function parsePeriod(s: string | undefined): Period | null {
  const m = s?.match(/^(\S+?)\s*[-~〜]\s*(\S+)$/);
  if (!m) return null;
  const from = parseDate(m[1]);
  const to = parseDate(m[2]);
  return from && to ? { from, to } : null;
}

/**
 * 머리글에서 열을 찾는다. 문자열이면 같은 이름을 먼저 찾고, 없으면 "이름(…)" 꼴을 찾는다
 * ("損益" 은 "損益(%)" 보다 "損益" 을, "実現損益" 은 "実現損益(税引前・円)" 을 찾는다). 없으면 -1.
 */
export function findColumn(header: readonly string[], match: string | ((cell: string) => boolean)): number {
  if (typeof match === "function") return header.findIndex(match);
  const exact = header.indexOf(match);
  return exact >= 0 ? exact : header.findIndex((h) => h.startsWith(`${match}(`));
}
