// SBI download names and locations live here so every upload view uses the same guidance.
export const SBI_GUIDES = [
  {
    kind: "portfolio",
    name: "ポートフォリオ",
    description: "일본주식의 보유수량과 취득단가가 들어 있습니다.",
    path: ["ポートフォリオ", "CSVダウンロード"],
    helpUrl: "https://search.sbisec.co.jp/v2/popwin/help/portfolio_02_01.html",
  },
  {
    kind: "usTrades",
    name: "約定履歴",
    description:
      "미국주식의 매수·매도 내역이 들어 있습니다. 거래 내역으로 보유수량과 취득단가를 추정합니다.",
    path: ["外国株式", "取引照会", "約定履歴", "米国株式(現物)", "CSVダウンロード"],
    helpUrl: "https://search.sbisec.co.jp/v2/popwin/help/manage_19_01.html",
  },
] as const;
