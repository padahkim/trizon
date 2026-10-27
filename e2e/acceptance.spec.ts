import { expect, test } from "@playwright/test";

test("처음 접속하면 일본 증권사와 접힌 한국 증권사가 있는 빈 대시보드가 열린다", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByRole("heading", { name: "대시보드", level: 1 })).toBeVisible();
  const japan = page.getByRole("region", { name: "일본 증권사", exact: true });
  await expect(japan.getByRole("heading", { name: "일본 증권사", level: 2 })).toBeVisible();
  const sbi = japan.getByRole("region", { name: "SBI증권", exact: true });
  await expect(sbi.getByRole("heading", { name: "SBI증권", level: 3 })).toBeVisible();
  await expect(sbi.getByRole("heading", { name: "CSV 올리기 안내", level: 4 })).toBeVisible();

  const korea = page.getByRole("region", { name: "한국 증권사", exact: true });
  await expect(korea.getByRole("heading", { name: "한국 증권사", level: 2 })).toBeVisible();
  await expect(korea.getByText("연결된 증권사 없음", { exact: true })).toBeVisible();
  const japanBounds = await japan.boundingBox();
  const koreaBounds = await korea.boundingBox();
  expect(koreaBounds!.y).toBeGreaterThanOrEqual(japanBounds!.y + japanBounds!.height);
});

test("두 CSV의 내용과 SBI 다운로드 위치를 일본어 원문으로 안내한다", async ({ page }) => {
  await page.goto("/");

  const sbi = page.getByRole("region", { name: "SBI증권", exact: true });
  const files = sbi.getByRole("list", { name: "받을 CSV" }).getByRole("listitem");
  await expect(files).toHaveCount(2);
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");

  const portfolio = files.filter({ has: page.getByRole("heading", { name: "ポートフォリオ", exact: true }) });
  await expect(portfolio.getByRole("heading", { name: "ポートフォリオ", exact: true })).toHaveAttribute("lang", "ja");
  await expect(portfolio.getByText("일본주식의 보유수량과 취득단가가 들어 있습니다.", { exact: true })).toBeVisible();
  const portfolioLocation = portfolio.getByRole("link", { name: "ポートフォリオ › CSVダウンロード", exact: true });
  await expect(portfolioLocation).toBeVisible();
  await expect(portfolioLocation).toHaveAttribute("lang", "ja");
  await expect(portfolioLocation).toHaveAttribute("href", "https://search.sbisec.co.jp/v2/popwin/help/portfolio_02_01.html");

  const trades = files.filter({ has: page.getByRole("heading", { name: "約定履歴", exact: true }) });
  await expect(trades.getByRole("heading", { name: "約定履歴", exact: true })).toHaveAttribute("lang", "ja");
  await expect(trades.getByText("미국주식의 매수·매도 내역이 들어 있습니다. 거래 내역으로 보유수량과 취득단가를 추정합니다.", { exact: true })).toBeVisible();
  const tradesLocation = trades.getByRole("link", { name: "外国株式 › 取引照会 › 約定履歴 › 米国株式(現物) › CSVダウンロード", exact: true });
  await expect(tradesLocation).toBeVisible();
  await expect(tradesLocation).toHaveAttribute("lang", "ja");
  await expect(tradesLocation).toHaveAttribute("href", "https://search.sbisec.co.jp/v2/popwin/help/manage_19_01.html");
});
