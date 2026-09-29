import type { DividendItem } from "./types.ts";

// 건별 행을 종목 × 口座별로 묶는다 (화면의 "상세" 토글). 같은 종목도 口座(NISA·特定)가 다르면 따로 둔다.

export type SecurityName = { name: string; code: string | null };

/**
 * SBI 가 이름 뒤에 붙이는 코드·티커를 떼어 낸다.
 * "トヨタ自動車 7203" → 7203, "ユナイテッドヘルス グループ UNH" → UNH, 코드가 없으면 code null.
 */
export function splitSecurityName(full: string): SecurityName {
  const m = full.match(/^(.*\S)\s+(\d[0-9A-Z]{3}|[A-Z][A-Z0-9.-]{0,9})$/);
  return m ? { name: m[1], code: m[2] } : { name: full, code: null };
}

export type DividendStock = {
  /** 商品 + 코드(없으면 이름) + 口座 */
  key: string;
  product: string;
  /** 이 종목의 가장 최근 입금 이름 — 口座가 달라도 같은 이름을 쓴다 (사명이 바뀌어도 코드가 같으면 한 종목이다) */
  name: string;
  code: string | null;
  /** 이 口座의 입금에 쓰인 예전 이름 (Zホールディングス → LINEヤフー) */
  otherNames: string[];
  account: string;
  /** 가장 최근 입금의 수량 */
  quantity: number | null;
  amountJpy: number;
  /** 최근 입금부터 */
  items: DividendItem[];
};

/** 투자신탁 분배금은 数量의 단위(1좌·1만좌)를 아직 확인하지 못했다 — 받은 CSV 에 투자신탁 행이 없었다 */
export const isFundProduct = (product: string) => product === "投資信託";

/** 1주당 받은 금액 (세후 엔). 투자신탁·수량 없음은 null */
export function perShareJpy(it: DividendItem): number | null {
  if (isFundProduct(it.product) || !it.quantity) return null;
  return it.amountJpy / it.quantity;
}

/** 받은 금액이 큰 종목부터. 같은 종목의 口座들은 붙여 두고, 그 안에서도 금액이 큰 口座부터 */
export function groupDividendsByStock(items: readonly DividendItem[]): DividendStock[] {
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
  const groups = new Map<string, DividendStock>();
  const stockOf = new Map<string, { name: string; amountJpy: number }>();
  for (const it of sorted) {
    const { name, code } = splitSecurityName(it.name);
    const stockKey = `${it.product}|${code ?? name}`;
    const stock = stockOf.get(stockKey) ?? { name, amountJpy: 0 };
    stock.amountJpy += it.amountJpy;
    stockOf.set(stockKey, stock);

    const key = `${stockKey}|${it.account}`;
    const g = groups.get(key) ?? { key, product: it.product, name, code, otherNames: [], account: it.account, quantity: null, amountJpy: 0, items: [] };
    g.quantity ??= it.quantity;
    g.amountJpy += it.amountJpy;
    g.items.push(it);
    groups.set(key, g);
  }
  const stockKeyOf = (g: DividendStock) => `${g.product}|${g.code ?? g.name}`;
  for (const g of groups.values()) {
    g.name = stockOf.get(stockKeyOf(g))?.name ?? g.name;
    g.otherNames = [...new Set(g.items.map((it) => splitSecurityName(it.name).name))].filter((n) => n !== g.name);
  }
  const stockAmount = (g: DividendStock) => stockOf.get(stockKeyOf(g))?.amountJpy ?? 0;
  return [...groups.values()].sort(
    (a, b) => stockAmount(b) - stockAmount(a) || stockKeyOf(a).localeCompare(stockKeyOf(b)) || b.amountJpy - a.amountJpy,
  );
}
