import { expect, test, type Page } from "@playwright/test";
import { portfolioCsv, usTradesUtf8 } from "../lib/sbi/fixtures";
import { createFakeProvider } from "../lib/quotes/fake";

test.beforeEach(async ({ page }) => {
  const quotes = await createFakeProvider(() => new Date("2026-10-30T09:00:00Z")).fetchQuotes(["JP:1111", "JP:999A", "US:TSTA", "US:TSTB"]);
  await page.route("**/api/quotes?*", (route) => route.fulfill({ json: { quotes } }));
});

async function uploadAssets(page: Page) {
  await page.getByLabel("SBI CSV 파일").setInputFiles([
    { name: "synthetic-portfolio.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioCsv + `投資信託(金額/NISA預り(つみたて投資枠))
ファンド名,数量,取得単価,現在値
架空ファンドA,12500,8000,10000\n`) },
    { name: "synthetic-trades.csv", mimeType: "text/csv", buffer: Buffer.from(usTradesUtf8) },
  ]);
}

test("shows Japanese yen subtotal, converts US display on request and refreshes the combined yen total once", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-30T09:00:00Z"));
  let yenPerDollar = 150;
  await page.route("**/api/exchange-rate", (route) => route.fulfill({ json: { rate: { yenPerDollar, asOf: "2026-10-30T08:00:00Z" } } }));
  await page.goto("/");
  await uploadAssets(page);
  const summary = page.getByRole("region", { name: "자산 요약" });
  const total = summary.getByRole("group", { name: "엔화 총자산", exact: true });
  const japan = summary.getByRole("group", { name: "일본 엔 총자산", exact: true });
  const us = summary.getByRole("group", { name: "미국주식 자산", exact: true });
  await expect(japan).toContainText("¥32,500");
  await expect(japan).toContainText("일본주식 ¥20,000");
  await expect(japan).toContainText("투자신탁 ¥12,500");
  await expect(us).toContainText("$232.00");
  await expect(total).toContainText("¥67,300");
  await expect(summary).toContainText("1 USD = 150");
  await expect(page.getByLabel("일본 증권사 소계")).toHaveCount(0);
  const sbiTotal = page.getByRole("button", { name: /SBI증권 엔화 총액/ });
  await expect(sbiTotal).toContainText("¥67,300");
  await sbiTotal.hover();
  const breakdown = page.getByRole("tooltip");
  await expect(breakdown).toContainText("일본주식");
  await expect(breakdown).toContainText("¥20,000");
  await expect(breakdown).toContainText("투자신탁");
  await expect(breakdown).toContainText("¥12,500");
  await expect(breakdown).toContainText("미국주식 엔 환산");
  await expect(breakdown).toContainText("¥34,800");
  await expect(breakdown).toContainText("1 USD = 150 JPY");
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  await sbiTotal.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(breakdown).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("synthetic-sbi-breakdown.png"), fullPage: true, animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("일본주식 합계", { exact: true })).toHaveText("¥20,000");
  await expect(page.getByLabel("투자신탁 합계", { exact: true })).toHaveText("¥12,500");
  await expect(page.getByLabel("미국주식 합계", { exact: true })).toHaveText("$232.00 (¥34,800 · 1 USD = 150 JPY)");
  await us.getByRole("button", { name: "엔으로 표시", exact: true }).click();
  await expect(us).toContainText("¥34,800");
  const table = page.getByRole("table", { name: "미국주식 보유 종목" });
  const a = table.getByRole("row").filter({ hasText: "US-A" });
  await expect(a.getByRole("cell").nth(4)).toHaveText("¥27,300");
  await expect(a.getByRole("cell").nth(5)).toHaveText("-¥2,700-9.00%");
  await expect(total).toContainText("¥67,300");
  yenPerDollar = 200;
  await summary.getByRole("button", { name: "시세 새로고침", exact: true }).click();
  await expect(us).toContainText("¥46,400");
  await expect(total).toContainText("¥78,900");
  await us.getByRole("button", { name: "달러로 표시", exact: true }).click();
  await expect(us).toContainText("$232.00");
  await expect(a.getByRole("cell").nth(4)).toHaveText("$182.00");
  await page.screenshot({ path: test.info().outputPath("synthetic-yen-summary.png"), fullPage: true });
});

for (const failure of ["unavailable", "outdated"] as const) {
  test(`keeps dollar amounts and withholds a misleading yen total when the rate is ${failure}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-30T09:00:00Z"));
    let recover = false;
    await page.route("**/api/exchange-rate", (route) => failure === "unavailable" && !recover
      ? route.fulfill({ status: 502 })
      : route.fulfill({ json: { rate: { yenPerDollar: 150, asOf: recover ? "2026-10-30T08:00:00Z" : "2020-01-01T00:00:00Z" } } }));
    await page.goto("/");
    await uploadAssets(page);
    const summary = page.getByRole("region", { name: "자산 요약" });
    const total = summary.getByRole("group", { name: "엔화 총자산", exact: true });
    const us = summary.getByRole("group", { name: "미국주식 자산", exact: true });
    await expect(total).toContainText("환율 없음");
    await expect(us).toContainText("$232.00");
    await expect(us.getByRole("button", { name: "엔으로 표시", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: /SBI증권 엔화 총액 환율 없음/ })).toBeVisible();
    await expect(page.getByLabel("미국주식 합계", { exact: true })).toHaveText("$232.00 (엔 환산: 환율 없음)");
    recover = true;
    await summary.getByRole("button", { name: "환율 다시 조회", exact: true }).click();
    await expect(total).toContainText("¥67,300");
    await expect(us.getByRole("button", { name: "엔으로 표시", exact: true })).toBeEnabled();
  });
}
