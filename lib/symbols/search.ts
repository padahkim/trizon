import type { Market } from "../domain/model.ts";
import type { SymbolEntry } from "./types.ts";

export type PreparedIndex = {
  entries: readonly SymbolEntry[];
  /** entries[i] 의 이름·별칭을 정규화하고 공백을 뺀 것 */
  names: readonly string[][];
};

/** 전각 영숫자(Ｋ＆Ｏ)·반각 가나를 NFKC 로 맞추고 대소문자를 없앤다 */
export function normalizeText(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

const compact = (s: string) => normalizeText(s).replace(/\s+/g, "");

export function prepareIndex(entries: readonly SymbolEntry[]): PreparedIndex {
  return { entries, names: entries.map((e) => [e.name, ...e.aliases].map(compact)) };
}

/**
 * 이름(한·일·영) 또는 코드로 찾는다. 순위:
 *   코드 일치 → 코드 앞부분 → 이름 일치 → 이름 앞부분 → 띄어 쓴 낱말이 모두 이름에 들어 있음
 * 같은 순위면 선호 시장(지금 고른 계좌 기준) → 보통주 → 큰 회사 → 짧은 이름 순.
 */
export function searchSymbols(
  index: PreparedIndex,
  query: string,
  opts: { preferMarket?: Market; limit?: number } = {},
): SymbolEntry[] {
  const q = normalizeText(query).trim();
  if (q === "") return [];
  const whole = q.replace(/\s+/g, "");
  const tokens = q.split(/\s+/);
  const codeQueries = codeForms(whole);

  const hits: { e: SymbolEntry; rank: number }[] = [];
  index.entries.forEach((e, i) => {
    const rank = rankOf(e.code, index.names[i], whole, tokens, codeQueries);
    if (rank !== null) hits.push({ e, rank });
  });

  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(b.e.market === opts.preferMarket) - Number(a.e.market === opts.preferMarket) ||
      Number(a.e.kind !== undefined) - Number(b.e.kind !== undefined) ||
      (a.e.tier ?? 5) - (b.e.tier ?? 5) ||
      a.e.name.length - b.e.name.length ||
      a.e.code.localeCompare(b.e.code),
  );
  return hits.slice(0, opts.limit ?? 8).map((h) => h.e);
}

function rankOf(code: string, names: readonly string[], whole: string, tokens: readonly string[], codeQueries: readonly string[]): number | null {
  if (codeQueries.includes(code)) return 0;
  if (codeQueries.some((c) => code.startsWith(c))) return 1;
  if (names.includes(whole)) return 2;
  if (names.some((n) => n.startsWith(whole))) return 3;
  if (names.some((n) => tokens.every((t) => n.includes(t)))) return 4;
  return null;
}

/** 사용자가 붙여 넣는 코드 표기(005930.KS · A005930 · 7203.T · brk-b · BRK/B) → 목록의 코드 표기 */
function codeForms(whole: string): string[] {
  if (!/^[0-9a-z./-]+$/.test(whole)) return [];
  const c = whole.toUpperCase().replace(/\.(KS|KQ|T)$/, "").replace(/[-/]/g, ".");
  return /^A[0-9A-Z]{6}$/.test(c) ? [c, c.slice(1)] : [c];
}
