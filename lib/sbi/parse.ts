import { formatMoney } from "../format/money.ts";
import { findColumn, parseAmount, parseCsv, parseDate, parsePeriod } from "./csv.ts";
import type { SbiImport, SbiImports } from "./store.ts";
import type { SbiUsTradeState } from "./store.ts";
import { inferUsHoldings, mergeUsTrades, type MergedUsTrades } from "./us-trades.ts";
import type {
  DividendByProduct,
  DividendItem,
  Parsed,
  Period,
  PortfolioFund,
  PortfolioMargin,
  PortfolioStock,
  RealizedRow,
  SbiDataByKind,
  SbiDividends,
  SbiDataByImportKind,
  SbiImportKind,
  SbiKind,
  SbiPortfolio,
  SbiRealized,
  SbiUsTrade,
  SbiUsHolding,
  SbiUsTrades,
} from "./types.ts";

// SBI証券 CSV 3종의 파서. 열은 위치가 아니라 머리글 이름으로 찾는다 (셀은 parseCsv 가 NFKC 로 맞춰 둔다).
// 합계가 행의 합과 어긋나거나 읽지 못한 표가 있으면 warnings 로 알린다 — 조용히 빠지면 누적손익이 틀린다.

const yen = (n: number) => formatMoney(n, "JPY", "exact");

/** 파일 내용으로 종류를 가린다. SBI CSV 가 아니면 null */
export function detectKind(text: string): SbiImportKind | null {
  for (const row of parseCsv(text)) {
    const [first] = row;
    if (first === "約定履歴") return "usTrades";
    if (first === "国内約定日" && row.includes("銘柄コード") && row.includes("約定数量") && row.includes("約定単価")) return "usTrades";
    if (first === "ポートフォリオ一覧") return "portfolio";
    if ((first === "銘柄(コード)" || first === "ファンド名") && row.includes("取得単価")) return "portfolio";
    if (first === "商品" && row.some((c) => c.startsWith("実現損益"))) return "realized";
    if (first === "商品" && row.some((c) => c.startsWith("受取額"))) return "dividends";
    if (first === "受渡日" && row.includes("銘柄名")) return "dividends";
  }
  return null;
}

// ── 米国株式 約定履歴 ──────────────────────────────────────

const US_TRADE_REQUIRED = ["国内約定日", "銘柄", "銘柄コード", "商品区分", "取引", "預り区分", "約定数量", "約定単価"] as const;

export function parseUsTrades(text: string): Parsed<SbiUsTrades> {
  const rows = parseCsv(text);
  const h = rows.findIndex((r) => r[0] === "国内約定日" && r.includes("銘柄コード"));
  if (h < 0) return { ok: false, error: "미국주식 약정이력 표(国内約定日 · 銘柄コード)를 찾지 못했습니다" };

  const header = rows[h];
  const missing = US_TRADE_REQUIRED.filter((name) => findColumn(header, name) < 0);
  if (missing.length > 0) return { ok: false, error: `필수 열이 없습니다: ${missing.join(", ")}` };

  const col = {
    date: findColumn(header, "国内約定日"),
    name: findColumn(header, "銘柄"),
    ticker: findColumn(header, "銘柄コード"),
    market: findColumn(header, "市場"),
    product: findColumn(header, "商品区分"),
    side: findColumn(header, "取引"),
    account: findColumn(header, "預り区分"),
    quantity: findColumn(header, "約定数量"),
    price: findColumn(header, "約定単価"),
    settlementDate: findColumn(header, "国内受渡日"),
    settlement: findColumn(header, "受渡金額/決済損益"),
    tradeId: findColumn(header, (cell) => ["約定番号", "注文番号", "取引番号"].includes(cell)),
  };
  const warnings: string[] = [];
  const trades: SbiUsTrade[] = [];
  const occurrences = new Map<string, number>();
  let sourceRowCount = 0;

  for (const row of rows.slice(h + 1)) {
    if (row.length === 0) continue;
    sourceRowCount++;
    const date = parseDate(row[col.date]);
    const ticker = normalizeUsTicker(row[col.ticker] ?? "");
    const side = row[col.side] === "現買" ? "buy" : row[col.side] === "現売" ? "sell" : null;
    const quantity = cell(row, col.quantity);
    const price = currencyAmount(row[col.price]);
    const settlement = currencyAmount(row[col.settlement]);
    const product = row[col.product] ?? "";

    if (product !== "米国株式") {
      warnings.push(`미국주식이 아닌 행을 제외했습니다: ${product || "상품구분 없음"}`);
      continue;
    }
    if (!date || !ticker || !side || quantity === null || !(quantity > 0) || !price || price.currency !== "USD") {
      warnings.push(`읽지 못한 약정 행: ${row.slice(0, 10).join(" / ")}`);
      continue;
    }
    if (settlement && settlement.currency !== "USD") {
      warnings.push(`${ticker} ${date}: USD가 아닌 결제금액은 수수료 추정에서 제외했습니다`);
    }

    const tradeId = col.tradeId >= 0 ? row[col.tradeId] || null : null;
    const accountType = row[col.account] ?? "";
    const baseKey = tradeId
      ? `id:${tradeId}`
      : [date, ticker, side, quantity, price.amount, accountType, row[col.settlementDate] ?? "", settlement?.amount ?? ""].join("|");
    const occurrence = (occurrences.get(baseKey) ?? 0) + 1;
    occurrences.set(baseKey, occurrence);
    const gross = quantity * price.amount;
    const settledUsd = settlement?.currency === "USD" ? settlement.amount : null;
    const estimatedFee = settledUsd === null ? null : cleanMoney(side === "buy" ? settledUsd - gross : gross - settledUsd);

    trades.push({
      dedupeKey: `${baseKey}#${occurrence}`,
      tradeId,
      date,
      settlementDate: parseDate(row[col.settlementDate]),
      ticker,
      name: row[col.name] ?? ticker,
      market: row[col.market] ?? "",
      side,
      accountType,
      quantity,
      unitPrice: price.amount,
      priceCurrency: "USD",
      settlementAmount: settledUsd,
      settlementCurrency: settledUsd === null ? null : "USD",
      estimatedFee: estimatedFee !== null && estimatedFee >= -0.01 ? Math.max(0, estimatedFee) : null,
    });
  }

  if (trades.length === 0) return { ok: false, error: "읽을 수 있는 미국주식 현물 매수·매도 약정이 없습니다" };
  if (sourceRowCount >= 1_000) warnings.push("이 파일은 1,000건 한도에 닿았습니다 — SBI에서 기간을 나눠 받은 CSV도 함께 넣어 주세요");
  if (trades.length !== sourceRowCount) warnings.push(`${sourceRowCount}행 중 ${trades.length}건의 미국주식 현물 약정을 읽었습니다`);

  return { ok: true, data: { period: usTradePeriod(rows.slice(0, h)), trades, sourceRowCount }, warnings: [...new Set(warnings)] };
}

function normalizeUsTicker(value: string): string {
  const ticker = value.trim().toUpperCase().replace(/[\s/]+/g, ".");
  return /^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?$/.test(ticker) && ticker.length <= 10 ? ticker : "";
}

function currencyAmount(value: string | undefined): { amount: number; currency: string } | null {
  const match = value?.replace(/\s/g, "").match(/^([+-]?(?:\d[\d,]*(?:\.\d*)?|\.\d+))([A-Z]{3})$/);
  if (!match) return null;
  const amount = parseAmount(match[1]);
  return amount === null ? null : { amount, currency: match[2] };
}

function cleanMoney(value: number): number {
  return Number(value.toFixed(10));
}

function usTradePeriod(rows: readonly string[][]): Period | null {
  const h = rows.findIndex((r) => r.includes("約定開始年月日") && r.includes("約定終了年月日"));
  if (h < 0) return null;
  const values = rows[h + 1] ?? [];
  const from = parseJapaneseDate(values[findColumn(rows[h], "約定開始年月日")]);
  const to = parseJapaneseDate(values[findColumn(rows[h], "約定終了年月日")]);
  return from && to ? { from, to } : null;
}

function parseJapaneseDate(value: string | undefined): string | null {
  const match = value?.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : null;
}

// ── 実現損益 ────────────────────────────────────────────────

export function parseRealized(text: string): Parsed<SbiRealized> {
  const rows = parseCsv(text);
  const h = rows.findIndex((r) => r[0] === "商品" && r.some((c) => c.startsWith("実現損益")));
  if (h < 0) return { ok: false, error: "실현손익 표(商品 · 実現損益)를 찾지 못했습니다" };

  const warnings: string[] = [];
  const period = periodFrom(rows.slice(0, h), "約定日");
  const header = rows[h];
  const col = { pnl: findColumn(header, "実現損益"), profit: findColumn(header, "利益金額"), loss: findColumn(header, "損失金額") };

  const out: RealizedRow[] = [];
  let total: RealizedRow | null = null;
  for (const r of rows.slice(h + 1)) {
    if (r.length === 0) break;
    const pnl = parseAmount(r[col.pnl]);
    if (pnl === null) {
      warnings.push(`읽지 못한 행: ${r.join(" / ")}`);
      continue;
    }
    const row = { product: r[0], pnl, profit: cell(r, col.profit), loss: cell(r, col.loss) };
    if (r[0] === "合計") total = row;
    else out.push(row);
  }
  if (!total && out.length === 0) return { ok: false, error: "실현손익 행이 없습니다" };

  const sum = out.reduce((s, r) => s + r.pnl, 0);
  if (!total) {
    total = { product: "合計", pnl: sum, profit: sumOrNull(out.map((r) => r.profit)), loss: sumOrNull(out.map((r) => r.loss)) };
  } else if (out.length > 0 && Math.abs(total.pnl - sum) > 1) {
    warnings.push(`상품별 합(${yen(sum)})이 合計(${yen(total.pnl)})와 다릅니다 — 合計를 씁니다`);
  }
  return { ok: true, data: { period, beforeTax: header[col.pnl].includes("税引前"), rows: out, total }, warnings };
}

// ── ポートフォリオ ──────────────────────────────────────────
//
// 구조: 머리말(한 칸짜리 줄 여러 개) → [표 제목 / 머리글 / 행…] → [“…合計” / 머리글 / 값] 이 반복되고 끝에 “総合計”.
// 표 제목에 預り 구분(特定, NISA預り(成長投資枠) …)이 들어 있다.

type SectionKind = "stock" | "margin" | "fund";

function sectionKind(header: readonly string[]): SectionKind | null {
  if (header[0] === "銘柄(コード)" && header.includes("建単価")) return "margin";
  if (header[0] === "銘柄(コード)" && header.includes("取得単価")) return "stock";
  if (header[0] === "ファンド名" && header.includes("取得単価")) return "fund";
  return null;
}

/** 표 제목 → 預り 구분 ("株式(現物/NISA預り(成長投資枠))" → "NISA成長") */
export function accountTypeOf(title: string): string {
  if (title.includes("信用")) return "信用";
  if (title.includes("旧NISA")) return "旧NISA";
  if (title.includes("つみたて")) return "NISAつみたて";
  if (title.includes("成長")) return "NISA成長";
  if (title.includes("NISA")) return "NISA";
  if (title.includes("特定")) return "特定";
  if (title.includes("一般")) return "一般";
  return "";
}

export function parsePortfolio(text: string): Parsed<SbiPortfolio> {
  const rows = parseCsv(text);
  const warnings: string[] = [];
  const data: SbiPortfolio = { stocks: [], margins: [], funds: [], holdingsComplete: true, csvTotal: null };
  const sectionSums = new Map<string, number>();
  const unread: string[] = [];
  let title = "";
  let declared: number | null = null;
  let range: [number, number] | null = null;

  for (let i = 0; i < rows.length; ) {
    const r = rows[i];
    if (r.length <= 1) {
      if (r.length === 1) {
        title = r[0];
        const count = title.match(/^総件数:(\d+)件$/);
        if (count) declared = Number(count[1]);
        const sel = title.match(/^選択範囲:(\d+)-(\d+)件$/);
        if (sel) range = [Number(sel[1]), Number(sel[2])];
      }
      i++;
      continue;
    }

    // "…合計" 다음은 머리글 한 줄 + 값 한 줄
    if (title.endsWith("合計")) {
      const values = rows[i + 1] ?? [];
      const get = (name: string) => cell(values, findColumn(r, name));
      if (title === "総合計") {
        data.csvTotal = { value: get("評価額"), marginNotional: get("建代金"), pnl: get("含み損益") };
      } else {
        const section = title.slice(0, -"合計".length);
        const expected = get("評価額") ?? get("建代金");
        const actual = sectionSums.get(section);
        if (expected !== null && actual !== undefined && Math.abs(expected - actual) > 1) {
          warnings.push(`「${section}」 행을 더한 값(${yen(actual)})이 CSV 합계(${yen(expected)})와 다릅니다 — 읽지 못한 행이 있을 수 있습니다`);
        }
      }
      title = "";
      i += 2;
      continue;
    }

    // 표: 머리글 + 셀이 2개 이상인 줄이 이어지는 동안
    const header = r;
    const body: string[][] = [];
    for (i++; i < rows.length && rows[i].length >= 2; i++) body.push(rows[i]);
    const kind = sectionKind(header);
    if (!kind) {
      unread.push(`「${title || header[0]}」 ${body.length}행`);
      continue;
    }
    const accountType = accountTypeOf(title);
    const sum =
      kind === "stock"
        ? readStocks(header, body, accountType, data.stocks, warnings)
        : kind === "margin"
          ? readMargins(header, body, data.margins, warnings)
          : readFunds(header, body, accountType, data.funds, warnings);
    sectionSums.set(title, sum);
  }

  const readCount = data.stocks.length + data.margins.length + data.funds.length;
  if (readCount === 0 && unread.length > 0) {
    return { ok: false, error: `읽을 수 있는 보유종목 표가 없습니다 (읽지 못한 표: ${unread.join(", ")})` };
  }
  if (readCount === 0 && !rows.some((r) => r[0] === "ポートフォリオ一覧")) {
    return { ok: false, error: "보유종목 표(銘柄(コード) · 取得単価)를 찾지 못했습니다" };
  }
  if (unread.length > 0) warnings.push(`읽지 못한 표가 있어 합계에서 빠졌습니다: ${unread.join(", ")}`);
  if (declared !== null && range && range[1] < declared) {
    warnings.push(`총 ${declared}건 중 ${range[0]}–${range[1]}건만 들어 있습니다 — SBI 화면에서 전체가 보이게 한 뒤 다시 받으세요`);
  } else if (declared !== null && readCount < declared) {
    warnings.push(`총 ${declared}건 중 ${readCount}건만 읽었습니다`);
  }
  // 정상적인 빈 포트폴리오 안내는 불완전 파싱이 아니다. 그 외 경고는 행·표·페이지 누락 가능성을 뜻한다.
  data.holdingsComplete = warnings.length === 0;
  if (readCount === 0) warnings.push("보유종목이 없습니다");
  return { ok: true, data, warnings };
}

function readStocks(header: string[], body: string[][], accountType: string, out: PortfolioStock[], warnings: string[]): number {
  const col = {
    name: findColumn(header, "銘柄(コード)"),
    bought: findColumn(header, "買付日"),
    qty: findColumn(header, "数量"),
    cost: findColumn(header, "取得単価"),
    price: findColumn(header, "現在値"),
    pnl: findColumn(header, "損益"),
    value: findColumn(header, "評価額"),
  };
  let sum = 0;
  for (const r of body) {
    const m = r[col.name]?.match(/^(\d[0-9A-Z]{3})\s+(.+)$/);
    const quantity = cell(r, col.qty);
    const unitCost = cell(r, col.cost);
    if (!m || quantity === null || !(quantity > 0) || unitCost === null) {
      warnings.push(`읽지 못한 행: ${r.slice(0, 4).join(" / ")}`);
      continue;
    }
    const value = cell(r, col.value);
    sum += value ?? 0;
    out.push({
      accountType,
      code: m[1],
      name: m[2],
      boughtAt: parseDate(r[col.bought]),
      quantity,
      unitCost,
      price: cell(r, col.price),
      pnl: cell(r, col.pnl),
      value,
    });
  }
  return sum;
}

function readMargins(header: string[], body: string[][], out: PortfolioMargin[], warnings: string[]): number {
  const col = {
    name: findColumn(header, "銘柄(コード)"),
    side: findColumn(header, "売/買建"),
    market: findColumn(header, "市場"),
    term: findColumn(header, "期限"),
    opened: findColumn(header, (h) => h === "買付日" || h === "建日"),
    qty: findColumn(header, "数量"),
    open: findColumn(header, "建単価"),
    price: findColumn(header, "現在値"),
    pnl: findColumn(header, "損益"),
    notional: findColumn(header, "建代金"),
  };
  let sum = 0;
  for (const r of body) {
    const m = r[col.name]?.match(/^(\d[0-9A-Z]{3})\s+(.+)$/);
    const sideText = r[col.side] ?? "";
    const side = sideText.startsWith("買") ? "buy" : sideText.startsWith("売") ? "sell" : null;
    const quantity = cell(r, col.qty);
    const openPrice = cell(r, col.open);
    if (!m || !side || quantity === null || !(quantity > 0) || openPrice === null) {
      warnings.push(`읽지 못한 신용 행: ${r.slice(0, 4).join(" / ")}`);
      continue;
    }
    const notional = cell(r, col.notional);
    sum += notional ?? 0;
    out.push({
      code: m[1],
      name: m[2],
      side,
      market: r[col.market] ?? "",
      term: r[col.term] ?? "",
      openedAt: parseDate(r[col.opened]),
      quantity,
      openPrice,
      price: cell(r, col.price),
      pnl: cell(r, col.pnl),
      notional,
    });
  }
  return sum;
}

function readFunds(header: string[], body: string[][], accountType: string, out: PortfolioFund[], warnings: string[]): number {
  const col = {
    name: findColumn(header, "ファンド名"),
    qty: findColumn(header, "数量"),
    cost: findColumn(header, "取得単価"),
    price: findColumn(header, "現在値"),
    pnl: findColumn(header, "損益"),
    value: findColumn(header, "評価額"),
  };
  let sum = 0;
  for (const r of body) {
    const name = r[col.name] ?? "";
    const quantity = cell(r, col.qty);
    const unitCost = cell(r, col.cost);
    if (name === "" || quantity === null || !(quantity > 0) || unitCost === null) {
      warnings.push(`읽지 못한 투자신탁 행: ${r.slice(0, 4).join(" / ")}`);
      continue;
    }
    const price = cell(r, col.price);
    const value = cell(r, col.value);
    sum += value ?? 0;
    out.push({ accountType, name, quantity, unitCost, price, unitSize: fundUnitSize(quantity, price, value), pnl: cell(r, col.pnl), value });
  }
  return sum;
}

/**
 * 기준가가 몇 좌당 값인지. SBI 는 1만좌당으로 보여 주지만, CSV 의 評価額 과 맞는 쪽을 고른다
 * (口数 × 基準価額 ÷ 10000 = 評価額).
 */
export function fundUnitSize(quantity: number, price: number | null, value: number | null): number {
  if (price === null || value === null) return 10_000;
  const diff = (unit: number) => Math.abs((quantity * price) / unit - value);
  return diff(10_000) <= diff(1) ? 10_000 : 1;
}

// ── 配当・分配金 ────────────────────────────────────────────

export function parseDividends(text: string): Parsed<SbiDividends> {
  const rows = parseCsv(text);
  const warnings: string[] = [];
  const period = periodFrom(rows, "受渡日");
  const declared = cell(rows.find((r) => r[0] === "検索件数") ?? [], 1);

  // 商品별 합계 표
  const byProduct: DividendByProduct[] = [];
  let summaryTotal: number | null = null;
  const hs = rows.findIndex((r) => r[0] === "商品" && r.some((c) => c.startsWith("受取額")));
  if (hs >= 0) {
    const header = rows[hs];
    const jpy = findColumn(header, (h) => h.startsWith("受取額") && h.includes("円"));
    const usd = findColumn(header, (h) => h.startsWith("受取額") && h.includes("USD"));
    for (const r of rows.slice(hs + 1)) {
      if (r.length === 0) break;
      const amountJpy = cell(r, jpy);
      if (amountJpy === null) continue;
      if (r[0] === "合計") summaryTotal = amountJpy;
      else byProduct.push({ product: r[0], amountJpy, amountUsd: cell(r, usd) });
    }
  }

  // 건별 표
  const items: DividendItem[] = [];
  const hd = rows.findIndex((r) => r[0] === "受渡日" && r.includes("銘柄名"));
  if (hd >= 0) {
    const header = rows[hd];
    const col = {
      date: 0,
      account: findColumn(header, "口座"),
      product: findColumn(header, "商品"),
      name: findColumn(header, "銘柄名"),
      qty: findColumn(header, "数量"),
      jpy: findColumn(header, (h) => h.startsWith("受取額") && h.includes("円")),
    };
    for (const r of rows.slice(hd + 1)) {
      if (r.length === 0) continue;
      const date = parseDate(r[col.date]);
      const amountJpy = cell(r, col.jpy);
      if (!date || amountJpy === null) {
        warnings.push(`읽지 못한 행: ${r.slice(0, 4).join(" / ")}`);
        continue;
      }
      items.push({
        date,
        account: r[col.account] ?? "",
        product: r[col.product] ?? "",
        name: r[col.name] ?? "",
        quantity: cell(r, col.qty),
        amountJpy,
      });
    }
  }

  if (hs < 0 && hd < 0) return { ok: false, error: "배당·분배금 표(商品 · 受取額)를 찾지 못했습니다" };

  const itemSum = items.reduce((s, r) => s + r.amountJpy, 0);
  const productSum = byProduct.reduce((s, r) => s + r.amountJpy, 0);
  const totalJpy = summaryTotal ?? (byProduct.length > 0 ? productSum : itemSum);
  if (declared !== null && hd >= 0 && items.length !== declared) {
    warnings.push(`검색 건수 ${declared}건 중 ${items.length}건을 읽었습니다`);
  }
  // 건별 금액은 소수 둘째 자리에서 끊겨 있어 합이 조금 어긋난다 (114건에 0.46엔 관측)
  const tolerance = Math.max(1, items.length * 0.01);
  if (items.length > 0 && Math.abs(itemSum - totalJpy) > tolerance) {
    warnings.push(`건별 합(${yen(itemSum)})이 합계(${yen(totalJpy)})와 다릅니다 — 합계를 씁니다`);
  }
  return { ok: true, data: { period, byProduct, totalJpy, items }, warnings };
}

// ── 공통 ────────────────────────────────────────────────────

const cell = (row: readonly string[], index: number): number | null => (index >= 0 ? parseAmount(row[index]) : null);

function sumOrNull(values: (number | null)[]): number | null {
  return values.every((v) => v === null) ? null : values.reduce<number>((s, v) => s + (v ?? 0), 0);
}

/** 머리말의 ["約定日", "2021/8/1-2026/9/28"] 같은 기간 줄 */
function periodFrom(rows: readonly string[][], label: string): Period | null {
  for (const r of rows) {
    if (r[0] !== label || r.length !== 2) continue;
    const p = parsePeriod(r[1]);
    if (p) return p;
  }
  return null;
}

export const PARSERS: { [K in SbiImportKind]: (text: string) => Parsed<SbiDataByImportKind[K]> } = {
  realized: parseRealized,
  portfolio: parsePortfolio,
  dividends: parseDividends,
  usTrades: parseUsTrades,
};

export type LoadedImport<T> = {
  meta: Omit<SbiImport, "text">;
  /** 이 CSV 의 기준 시각: SBI 에서 받은 시각(파일 수정 시각), 모르면 가져온 시각 */
  asOf: string;
  parsed: Parsed<T>;
};
export type LoadedUsTrades = {
  files: Omit<SbiImport, "text">[];
  asOf: string;
  parsed: Parsed<MergedUsTrades>;
  holdings: SbiUsHolding[];
  needsReview: boolean;
  confirmedAt: string | null;
  closedCount: number;
};

export type LoadedSbi = { [K in SbiKind]: LoadedImport<SbiDataByKind[K]> | null } & { usTrades: LoadedUsTrades | null };

/** 저장해 둔 CSV 원문을 읽을 때마다 다시 파싱한다 — 파서를 고치면 CSV 를 다시 넣지 않아도 반영된다 */
export function parseImports(imports: SbiImports): LoadedSbi {
  function load<K extends SbiKind>(kind: K): LoadedImport<SbiDataByKind[K]> | null {
    const entry = imports[kind];
    if (!entry) return null;
    const { text, ...meta } = entry;
    return { meta, asOf: entry.fileModifiedAt ?? entry.importedAt, parsed: PARSERS[kind](text) };
  }
  return { realized: load("realized"), portfolio: load("portfolio"), dividends: load("dividends"), usTrades: loadUsTrades(imports.usTrades) };
}

function loadUsTrades(state: SbiUsTradeState | undefined): LoadedUsTrades | null {
  if (!state || state.files.length === 0) return null;
  const parsedFiles = state.files.map((file) => parseUsTrades(file.text));
  const failed = parsedFiles.filter((result): result is Extract<Parsed<SbiUsTrades>, { ok: false }> => !result.ok);
  const metas = state.files.map(({ text: _text, fingerprint: _fingerprint, ...meta }) => meta);
  const asOf = metas
    .map((meta) => meta.fileModifiedAt ?? meta.importedAt)
    .sort()
    .at(-1) as string;
  if (failed.length === parsedFiles.length) {
    return {
      files: metas,
      asOf,
      parsed: { ok: false, error: `저장한 약정이력 CSV를 읽지 못했습니다: ${failed.map((result) => result.error).join("; ")}` },
      holdings: state.holdings,
      needsReview: state.needsReview,
      confirmedAt: state.confirmedAt,
      closedCount: 0,
    };
  }
  const merged = mergeUsTrades(parsedFiles);
  const inferred = inferUsHoldings(merged.trades);
  const warnings = [...new Set([...merged.warnings, ...inferred.warnings, ...(failed.length > 0 ? [`${failed.length}개 파일을 읽지 못해 제외했습니다`] : [])])];
  return {
    files: metas,
    asOf,
    parsed: { ok: true, data: merged, warnings },
    holdings: state.holdings,
    needsReview: state.needsReview,
    confirmedAt: state.confirmedAt,
    closedCount: inferred.closedCount,
  };
}
