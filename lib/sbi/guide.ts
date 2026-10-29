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
    availability: "지금 올릴 수 있음",
    description:
      "미국주식의 매수·매도 내역이 들어 있습니다. 최근 2년까지, 파일당 1,000건이므로 기간을 나눠 받을 수 있습니다.",
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
  introduction: "일본주식 보유목록과 미국주식 거래내역 CSV를 함께 올릴 수 있습니다. 파일별 내용과 받는 방법을 확인하세요.",
  reopen: "SBI 카드에 CSV 파일을 끌어다 놓을 수 있습니다. CSV 올리기 버튼으로 파일 선택과 다운로드 안내를 다시 열 수 있습니다.",
  selection: "여러 파일을 고르거나 SBI 카드에 끌어다 놓습니다.",
  dropPrompt: "CSV 파일을 여기에 놓으세요.",
  dropHelp: "여러 파일을 함께 놓을 수 있습니다.",
  usTradesEmpty: " CSV를 올리면 보입니다.",
} as const;
