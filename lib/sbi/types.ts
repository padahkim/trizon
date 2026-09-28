// SBI証券 CSV 가져오기의 타입. 파서(parse.ts)가 만들고 평가(evaluate.ts)와 화면이 읽는다.

export const SBI_KINDS = ["realized", "portfolio", "dividends"] as const;
/** realized = 実現損益, portfolio = ポートフォリオ, dividends = 配当・分配金 */
export type SbiKind = (typeof SBI_KINDS)[number];

export function isSbiKind(value: unknown): value is SbiKind {
  return typeof value === "string" && (SBI_KINDS as readonly string[]).includes(value);
}

/** YYYY-MM-DD */
export type Period = { from: string; to: string };

/** 파싱 결과. warnings 는 읽기는 했지만 사용자가 알아야 할 것 (합계 불일치, 읽지 못한 표 등) */
export type Parsed<T> = { ok: true; data: T; warnings: string[] } | { ok: false; error: string };

// ── 実現損益 ────────────────────────────────────────────────

export type RealizedRow = { product: string; pnl: number; profit: number | null; loss: number | null };

export type SbiRealized = {
  period: Period | null;
  /** 머리글이 "実現損益(税引前・円)" 이면 true */
  beforeTax: boolean;
  /** 商品별 (合計 행 제외) */
  rows: RealizedRow[];
  total: RealizedRow;
};

// ── ポートフォリオ ──────────────────────────────────────────

/** 현물 주식. 금액은 모두 엔 */
export type PortfolioStock = {
  /** 預り 구분: 特定, NISA成長 … */
  accountType: string;
  code: string;
  name: string;
  boughtAt: string | null;
  quantity: number;
  /** 取得単価 (1주) */
  unitCost: number;
  /** 아래 셋은 CSV 를 받은 시점의 값 — 현재가를 못 받을 때만 쓴다 */
  price: number | null;
  pnl: number | null;
  value: number | null;
};

export type PortfolioMargin = {
  code: string;
  name: string;
  side: "buy" | "sell";
  market: string;
  term: string;
  openedAt: string | null;
  quantity: number;
  /** 建単価 */
  openPrice: number;
  price: number | null;
  /** SBI 가 보여 주는 損益 — 금리·수수료 등이 빠져 있다 */
  pnl: number | null;
  /** 建代金 */
  notional: number | null;
};

export type PortfolioFund = {
  accountType: string;
  name: string;
  /** 口数 */
  quantity: number;
  /** 取得単価 (unitSize 좌당) */
  unitCost: number;
  /** 基準価額 (unitSize 좌당) — 투자신탁은 시세를 받을 수 없어 이 값으로 평가한다 */
  price: number | null;
  /** 기준가가 가리키는 좌수. SBI 는 1만좌당으로 보여 준다 */
  unitSize: number;
  pnl: number | null;
  value: number | null;
};

export type SbiPortfolio = {
  stocks: PortfolioStock[];
  margins: PortfolioMargin[];
  funds: PortfolioFund[];
  /** CSV 의 総合計 (받은 시점의 SBI 화면 값, 참고용) */
  csvTotal: { value: number | null; marginNotional: number | null; pnl: number | null } | null;
};

// ── 配当・分配金 ────────────────────────────────────────────

export type DividendItem = {
  date: string;
  account: string;
  product: string;
  name: string;
  quantity: number | null;
  amountJpy: number;
};

export type DividendByProduct = { product: string; amountJpy: number; amountUsd: number | null };

export type SbiDividends = {
  period: Period | null;
  /** 商品별 (合計 행 제외) */
  byProduct: DividendByProduct[];
  /** 세후 엔 합계 */
  totalJpy: number;
  items: DividendItem[];
};

export type SbiDataByKind = { realized: SbiRealized; portfolio: SbiPortfolio; dividends: SbiDividends };
