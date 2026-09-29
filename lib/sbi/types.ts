// SBI証券 CSV 가져오기의 타입. 파서(parse.ts)가 만들고 평가(evaluate.ts)와 화면이 읽는다.

export const SBI_KINDS = ["realized", "portfolio", "dividends"] as const;
/** realized = 実現損益, portfolio = ポートフォリオ, dividends = 配当・分配金 */
export type SbiKind = (typeof SBI_KINDS)[number];

/** 미국주식 約定履歴는 평가손익을 만드는 보조 입력이라 누적손익의 3개 항목(SbiKind)과 구분한다. */
export const SBI_IMPORT_KINDS = [...SBI_KINDS, "usTrades"] as const;
export type SbiImportKind = (typeof SBI_IMPORT_KINDS)[number];

export function isSbiKind(value: unknown): value is SbiKind {
  return typeof value === "string" && (SBI_KINDS as readonly string[]).includes(value);
}

export function isSbiImportKind(value: unknown): value is SbiImportKind {
  return typeof value === "string" && (SBI_IMPORT_KINDS as readonly string[]).includes(value);
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

// ── 米国株式 約定履歴 ──────────────────────────────────────

export type UsTradeSide = "buy" | "sell";

/** 約定履歴의 한 체결. 금액 통화는 현재 확인된 SBI 형식에서 USD다. */
export type SbiUsTrade = {
  /** 파일이 겹쳐도 같은 체결만 제거하기 위한 키. 같은 파일 안의 동일 체결은 출현 순번으로 구분한다. */
  dedupeKey: string;
  tradeId: string | null;
  date: string;
  settlementDate: string | null;
  ticker: string;
  name: string;
  market: string;
  side: UsTradeSide;
  accountType: string;
  quantity: number;
  unitPrice: number;
  priceCurrency: "USD";
  settlementAmount: number | null;
  settlementCurrency: "USD" | null;
  /** 受渡金額과 수량×약정단가 차이로 구한 값. CSV에 별도 수수료 열은 없다. */
  estimatedFee: number | null;
};

export type SbiUsTrades = {
  period: Period | null;
  trades: SbiUsTrade[];
  /** 머리글 아래에서 발견한 원본 행 수(읽지 못한 행 포함) */
  sourceRowCount: number;
};

export type SbiUsCostCurrency = "USD" | "JPY";
export type SbiUsHoldingSource = "inferred" | "manual";

/** CSV 추정 뒤 사용자가 확인·수정한 현재 미국주식 잔고. */
export type SbiUsHolding = {
  id: string;
  ticker: string;
  name: string;
  quantity: number;
  /** 1주당 평균 취득단가 */
  avgCost: number;
  costCurrency: SbiUsCostCurrency;
  accountType: string;
  source: SbiUsHoldingSource;
};

export type SbiDataByKind = { realized: SbiRealized; portfolio: SbiPortfolio; dividends: SbiDividends };
export type SbiDataByImportKind = SbiDataByKind & { usTrades: SbiUsTrades };
