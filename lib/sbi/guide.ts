import type { SbiImportKind } from "./types.ts";

// SBI 화면 안내 문구 — CSV 를 받는 경로와 각 항목의 뜻은 여기 한 곳에만 둔다 (화면과 AGENTS.md 가 여기를 가리킨다).

export type SbiGuide = {
  kind: SbiImportKind;
  step: "1" | "2A" | "2B" | "3";
  title: string;
  /** SBI 화면의 이름 */
  jpTitle: string;
  /** 한 줄 뜻 */
  meaning: string;
  detail: string;
  /** SBI 사이트에서 누르는 순서 */
  path: readonly string[];
  tip?: string;
};

export const SBI_GUIDES: readonly SbiGuide[] = [
  {
    kind: "realized",
    step: "1",
    title: "실현손익",
    jpTitle: "実現損益",
    meaning: "이미 팔아서 확정된 손익이에요.",
    detail: "판 금액에서 산 금액을 뺀 값을 상품별로 모은 것으로, 세금을 떼기 전(税引前) 금액이에요.",
    path: ["口座管理", "My資産", "実現損益", "実現損益詳細", "CSVダウンロード"],
    tip: "기간(約定日)을 가장 처음부터 오늘까지로 넓혀서 받아야 ‘누적’이 돼요.",
  },
  {
    kind: "portfolio",
    step: "2A",
    title: "평가손익",
    jpTitle: "ポートフォリオ",
    meaning: "지금 들고 있는 종목의, 아직 팔지 않은 손익이에요.",
    detail:
      "CSV에서는 수량과 취득단가만 쓰고 현재가는 trizon이 직접 가져와요. 그래서 매일 넣을 필요 없이 사고팔았을 때만 다시 넣으면 돼요. 투자신탁은 시세를 받을 수 없어 CSV의 기준가를 써요.",
    path: ["ポートフォリオ", "CSVダウンロード"],
    tip: "여기서 읽은 종목은 대시보드의 SBI証券 계좌에도 자동으로 들어가요.",
  },
  {
    kind: "usTrades",
    step: "2B",
    title: "미국주식 보유 추정",
    jpTitle: "約定履歴",
    meaning: "최근 거래로 지금 남은 미국주식 수량을 추정해요.",
    detail:
      "최근 2년의 현물 매수·매도를 합쳐 잔고를 추정합니다. 전량 매도 종목은 평가에서 빼고, 오래전부터 계속 보유한 종목만 아래 확인 화면에서 보정하세요.",
    path: ["外国株式", "取引照会", "約定履歴", "米国株式(現物)", "CSVダウンロード"],
    tip: "1,000건이 넘으면 기간을 나눠 여러 CSV를 한꺼번에 넣으세요. 겹치는 체결은 한 번만 반영합니다.",
  },
  {
    kind: "dividends",
    step: "3",
    title: "배당·분배금",
    jpTitle: "配当・分配金",
    meaning: "들고 있는 동안 받은 배당금과 분배금이에요.",
    detail: "주식의 배당금과 투자신탁·ETF의 분배금을 모은 것으로, 세금을 뗀 뒤(税引後) 실제로 들어온 금액이에요.",
    path: ["My資産", "配当・分配金", "CSVダウンロード"],
    tip: "기간(受渡日)을 가장 처음부터 오늘까지로 넓혀서 받으세요.",
  },
];

export const SBI_GUIDE: Record<SbiImportKind, SbiGuide> = {
  realized: SBI_GUIDES[0],
  portfolio: SBI_GUIDES[1],
  usTrades: SBI_GUIDES[2],
  dividends: SBI_GUIDES[3],
};

const PRODUCT_LABEL: Record<string, string> = {
  "国内株式(現物)": "일본주식 현물",
  "国内株式(信用)": "일본주식 신용",
  米国株式: "미국주식",
  外国株式: "외국주식",
  投資信託: "투자신탁",
  債券: "채권",
};

/** CSV 의 商品 이름 → 화면 이름. 모르는 이름은 그대로 */
export const productLabel = (product: string) => PRODUCT_LABEL[product] ?? product;
