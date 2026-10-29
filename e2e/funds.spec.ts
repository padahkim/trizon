import { expect, test } from "@playwright/test";

// Entirely synthetic holdings; no real portfolio values or fund identifiers.
const funds = `投資信託(金額/NISA預り(成長投資枠))
ファンド名,数量,取得単価,現在値,前日比,損益,評価額
架空ファンドA,12500,8000,10000,100,2500,12500
投資信託(金額/NISA預り(つみたて投資枠))
ファンド名,数量,取得単価,現在値,前日比,損益,評価額
架空ファンドA,25000,9000,10000,100,2500,25000
投資信託(金額/つみたてNISA預り)
ファンド名,数量,取得単価,現在値,前日比,損益,評価額
架空ファンドB,10000,10000,9000,-50,-1000,9000`;

test("NISA investment trusts survive reload, contribute to yen totals and keep CSV valuations during a stock quote outage", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-30T09:00:00Z"));
  let failQuotes = false;
  const requestedKeys: string[] = [];
  await page.route("**/api/quotes?*", (route) => {
    requestedKeys.push(new URL(route.request().url()).searchParams.get("keys")!);
    return failQuotes ? route.fulfill({ status: 502 }) : route.fulfill({ json: { quotes: {
      "JP:1111": { price: 1200, previousClose: 1150, currency: "JPY", marketTime: "2026-10-30T06:00:00Z" },
    } } });
  });
  await page.goto("/");
  await page.getByLabel("SBI CSV 파일").setInputFiles({ name: "synthetic.csv", mimeType: "text/csv", buffer: Buffer.from(`ポートフォリオ一覧
株式(現物/特定預り)
銘柄(コード),数量,取得単価,現在値
1111 JP-A,10,1000,1200
${funds}`) });

  const table = page.getByRole("table", { name: "투자신탁 보유 종목" });
  const growth = table.getByRole("row").filter({ hasText: "NISA(成長投資枠)" });
  await expect(growth.getByRole("cell").nth(1)).toHaveText("12,500口");
  await expect(growth.getByRole("cell").nth(4)).toHaveText("¥12,500");
  await expect(growth.getByRole("cell").nth(5)).toHaveText("+¥2,500+25.00%");
  await expect(table.getByRole("row").filter({ hasText: "NISA(つみたて投資枠)" })).toContainText("¥25,000");
  await expect(table.getByRole("row").filter({ hasText: "つみたてNISA" })).toContainText("¥9,000");
  await expect(table.getByRole("columnheader", { name: "기준가(1만口)" })).toBeVisible();
  const summary = page.getByRole("region", { name: "자산 요약" });
  await expect(summary).toContainText("¥58,500");
  await expect(summary).toContainText("+¥825");
  await expect(page.getByRole("region", { name: "투자신탁", exact: true })).toContainText("CSV 기준가");
  await page.reload();
  await expect(growth.getByRole("cell").nth(4)).toHaveText("¥12,500");
  await expect(summary).toContainText("¥58,500");

  failQuotes = true;
  await summary.getByRole("button", { name: "시세 새로고침" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("투자신탁은 CSV 기준가를 유지합니다");
  await expect(summary).toContainText("¥56,500");
  await expect(growth.getByRole("cell").nth(4)).toHaveText("¥12,500");
  expect(requestedKeys.length).toBeGreaterThan(0);
  expect(requestedKeys.every((keys) => keys === "JP:1111")).toBe(true);
  await page.screenshot({ path: test.info().outputPath("synthetic-funds.png"), fullPage: true });
});
