// SBI download names and locations live here so every upload view uses the same guidance.
export const SBI_GUIDES = [
  {
    kind: "portfolio",
    name: "ポートフォリオ",
    availability: "지금 올릴 수 있음",
    description: "일본주식의 보유수량과 취득단가가 들어 있습니다.",
    steps: [
      { menu: "ポートフォリオ", detail: "SBI 웹사이트에 로그인하고 메뉴를 엽니다." },
      { menu: "CSVダウンロード", detail: "보유목록을 CSV로 받습니다." },
    ],
    helpUrl: "https://search.sbisec.co.jp/v2/popwin/help/portfolio_02_01.html",
  },
  {
    kind: "usTrades",
    name: "約定履歴",
    availability: "가져오기 준비 중",
    description:
      "미국주식의 매수·매도 내역이 들어 있습니다. 이 CSV를 가져오는 기능은 준비 중입니다.",
    steps: [
      { menu: "外国株式", detail: "SBI 웹사이트에 로그인하고 외국주식 화면을 엽니다." },
      {
        menu: "外国株式 Myメニュー › 取引照会 › 約定履歴",
        detail: "왼쪽 메뉴 아래쪽에 있습니다. 계좌관리와 별도 메뉴이며, 위쪽의 − 버튼으로 접으면 찾기 쉽습니다.",
      },
      { menu: "商品指定：株式 › 米国株式(現物) › 照会", detail: "미국주식 현물을 고르고 조회 기간을 지정한 뒤 조회합니다." },
      { menu: "CSVダウンロード", detail: "조회 결과에서 CSV를 받습니다." },
    ],
    // The integrated website's illustrated guide shows the actual sidebar and filters.
    helpUrl: "https://www.sbisec.co.jp/ETGate/WPLETmgR001Control?OutSide=on&burl=search_foreign&cat1=foreign&cat2=info&dir=info&file=foreign_guide_10.html&getFlg=on#02",
  },
] as const;

export const SBI_UPLOAD_GUIDANCE = {
  introduction: "지금은 일본주식 보유목록 CSV를 올릴 수 있습니다. 파일별 내용과 받는 방법을 확인하세요.",
  reopen: "CSV 올리기 버튼으로 파일 선택과 다운로드 안내를 다시 열 수 있습니다.",
  usTradesPending: "미국주식 CSV 가져오기는 준비 중입니다.",
} as const;
