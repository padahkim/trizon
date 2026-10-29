import { expect, test, type Page } from "@playwright/test";
import { portfolioShiftJis, usTradesUtf8 } from "../lib/sbi/fixtures";

test("1단계 완료 기준: 빈 대시보드 → 두 CSV·가짜 시세 평가 → 복원 → 데이터 지우기", async ({ page }) => {
  const japan = page.getByRole("region", { name: "일본 증권사", exact: true });
  const sbi = japan.getByRole("region", { name: "SBI증권", exact: true });
  const korea = page.getByRole("region", { name: "한국 증권사", exact: true });
  const jp = sbi.getByRole("region", { name: "일본주식", exact: true }).getByRole("table", { name: "일본주식 보유 종목" });
  const us = sbi.getByRole("region", { name: "미국주식", exact: true }).getByRole("table", { name: "미국주식 보유 종목" });
  const summary = page.getByRole("region", { name: "자산 요약" });

  async function expectEmptyDashboard() {
    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByRole("heading", { name: "대시보드", level: 1 })).toBeVisible();
    await expect(sbi.getByRole("heading", { name: "CSV 올리기 안내" })).toBeVisible();
    await expect(sbi.getByRole("heading", { name: "ポートフォリオ", exact: true })).toBeVisible();
    await expect(sbi.getByRole("heading", { name: "約定履歴", exact: true })).toBeVisible();
    await expect(korea.getByText("연결된 증권사 없음", { exact: true })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(summary).toHaveCount(0);
  }

  async function expectHoldings() {
    await expect(page.getByRole("table")).toHaveCount(2);
    await expect(jp.getByRole("row")).toHaveCount(4); // Header, two holdings, total.
    await expect(us.getByRole("row")).toHaveCount(4);
    await expect(jp.getByRole("row").filter({ hasText: "JP-A" }).getByRole("cell")).toHaveText([
      "JP-A特定1111", "10", "¥1,000", "¥1,200", "¥12,000", "+¥2,000+20.00%", "+¥500+4.35%",
    ]);
    await expect(jp.getByRole("row").filter({ hasText: "JP-B" }).getByRole("cell")).toHaveText([
      "JP-B特定999A", "10", "¥900", "¥800", "¥8,000", "-¥1,000-11.11%", "-¥200-2.44%",
    ]);
    // $45.50 × 4 must retain the cents in the price: $182.00, not $180.00.
    await expect(us.getByRole("row").filter({ hasText: "US-A" }).getByRole("cell")).toHaveText([
      "US-A特定TSTA", "4", "$50.00", "$45.50", "$182.00", "-$18.00-9.00%", "-$2.00-1.09%",
    ]);
    await expect(us.getByRole("row").filter({ hasText: "US-B" }).getByRole("cell")).toHaveText([
      "US-B特定TSTB", "2", "$20.00", "$25.00", "$50.00", "+$10.00+25.00%", "+$1.00+2.04%",
    ]);
  }

  async function expectTotals() {
    await expect(jp.getByRole("row").filter({ hasText: "일본주식 합계" }).getByRole("cell")).toHaveText([
      "일본주식 합계", "¥20,000", "+¥1,000+5.26%", "+¥300+1.52%",
    ]);
    await expect(us.getByRole("row").filter({ hasText: "미국주식 합계" }).getByRole("cell")).toHaveText([
      "미국주식 합계", "$232.00", "-$8.00-3.33%", "-$1.00-0.43%",
    ]);
    for (const text of ["일본 엔 총자산", "¥20,000", "+¥1,000", "+¥300", "미국주식 · 달러", "$232.00", "-$8.00", "-$1.00", "현금 제외"]) {
      await expect(summary.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(summary.getByText(/^일본 시세 /)).toBeVisible();
    await expect(summary.getByText(/^미국 시세 /)).toBeVisible();
    await expect(sbi.getByRole("button", { name: /SBI증권 엔화 총액/ })).toContainText("¥54,800");
  }

  await test.step("1. 처음 접속하면 CSV 안내와 접힌 한국 증권사가 있는 빈 대시보드가 열린다", async () => {
    await page.goto("/");
    await expectEmptyDashboard();
  });

  await test.step("2. 두 CSV를 함께 올리면 일본 증권사 › SBI증권 아래에 네 종목이 시장별로 나뉜다", async () => {
    await page.getByLabel("SBI CSV 파일").setInputFiles([
      { name: "holdings.txt", mimeType: "text/plain", buffer: Buffer.from(portfolioShiftJis) },
      { name: "renamed.txt", mimeType: "text/plain", buffer: Buffer.from(usTradesUtf8) },
    ]);
    await expect(jp.getByText("JP-A", { exact: true })).toBeVisible();
    await expect(jp.getByText("JP-B", { exact: true })).toBeVisible();
    await expect(us.getByText("US-A", { exact: true })).toBeVisible();
    await expect(us.getByText("US-B", { exact: true })).toBeVisible();
    await expect(sbi.getByRole("status").getByRole("listitem")).toHaveCount(2);
    await expect(sbi.getByRole("status")).toContainText("일본주식·투자신탁 보유를 교체했습니다.");
    await expect(sbi.getByRole("status")).toContainText("미국주식 거래를 누적했습니다.");
    await expect(sbi.getByText("約定履歴으로 추정한 값", { exact: true })).toBeVisible();
  });

  await test.step("3. 네 종목의 수량·가격·평가액·손익·전일 대비와 부호·달러 소수가 맞다", expectHoldings);

  await test.step("4. 엔·달러 시장별 합계와 요약이 맞고 시세를 새로 받을 수 있다", async () => {
    await expectTotals();
    const refreshed = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/quotes");
    await summary.getByRole("button", { name: "시세 새로고침" }).click();
    const response = await refreshed;
    expect(response.status()).toBe(200);
    expect(new URL(response.url()).searchParams.get("keys")).toBe("JP:1111,JP:999A,US:TSTA,US:TSTB");
    await expect(summary.getByRole("button", { name: "시세 새로고침" })).toBeEnabled();
    await expectHoldings();
    await expectTotals();
  });

  await test.step("5. 새로고침 뒤에도 네 종목과 합계가 남고 지우면 빈 대시보드가 유지된다", async () => {
    await page.reload();
    await expectHoldings();
    await expectTotals();
    await page.screenshot({ path: test.info().outputPath("acceptance.png"), fullPage: true });
    await page.getByRole("button", { name: "데이터 지우기", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "데이터를 지울까요?" });
    await dialog.getByRole("button", { name: "데이터 지우기", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expectEmptyDashboard();
    await page.reload();
    await expectEmptyDashboard();
  });
});

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

test("두 CSV의 지원 범위와 SBI 다운로드 순서를 안내한다", async ({ page }) => {
  await page.goto("/");

  const sbi = page.getByRole("region", { name: "SBI증권", exact: true });
  const files = sbi.getByRole("list", { name: "받을 CSV" }).locator(":scope > li");
  await expect(files).toHaveCount(2);
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");

  const portfolio = files.filter({ has: page.getByRole("heading", { name: "ポートフォリオ", exact: true }) });
  await expect(portfolio.getByRole("heading", { name: "ポートフォリオ", exact: true })).toHaveAttribute("lang", "ja");
  await expect(portfolio.getByText("일본주식·투자신탁의 보유수량과 취득단가가 들어 있습니다.", { exact: true })).toBeVisible();
  await expect(portfolio.getByText("지금 올릴 수 있음", { exact: true })).toBeVisible();
  const portfolioLocation = portfolio.getByRole("link", { name: "SBI 공식 다운로드 도움말 (새 창)", exact: true });
  await expect(portfolioLocation).toBeVisible();
  await expect(portfolioLocation).toHaveAttribute("href", "https://search.sbisec.co.jp/v2/popwin/help/portfolio_02_01.html");
  await expect(portfolio.getByRole("list", { name: "ポートフォリオ 다운로드 순서" }).getByRole("listitem")).toHaveCount(2);

  const trades = files.filter({ has: page.getByRole("heading", { name: "約定履歴", exact: true }) });
  await expect(trades.getByRole("heading", { name: "約定履歴", exact: true })).toHaveAttribute("lang", "ja");
  await expect(trades.getByText("지금 올릴 수 있음", { exact: true })).toBeVisible();
  await expect(trades.getByText("미국주식의 매수·매도 내역이 들어 있습니다. 최근 2년까지, 파일당 1,000건이므로 기간을 나눠 받을 수 있습니다.", { exact: true })).toBeVisible();
  const tradesSteps = trades.getByRole("list", { name: "約定履歴 다운로드 순서" }).getByRole("listitem");
  await expect(tradesSteps).toHaveCount(4);
  await expect(tradesSteps.nth(0)).toContainText("外国株式");
  await expect(tradesSteps.nth(1)).toContainText("外国株式 Myメニュー › 取引照会 › 約定履歴");
  await expect(tradesSteps.nth(1)).toContainText("계좌관리와 별도 메뉴");
  await expect(tradesSteps.nth(2)).toContainText("商品指定：株式 › 米国株式(現物) › 照会");
  await expect(tradesSteps.nth(3)).toContainText("CSVダウンロード");
  await expect(trades.getByText("外国株式 Myメニュー › 取引照会 › 約定履歴", { exact: true })).toHaveAttribute("lang", "ja");
  const tradesLocation = trades.getByRole("link", { name: "SBI 공식 다운로드 도움말 (새 창)", exact: true });
  await expect(tradesLocation).toBeVisible();
  await expect(tradesLocation).toHaveAttribute("href", "https://www.sbisec.co.jp/ETGate/WPLETmgR001Control?OutSide=on&burl=search_foreign&cat1=foreign&cat2=info&dir=info&file=foreign_guide_10.html&getFlg=on#02");
  await page.screenshot({ path: test.info().outputPath("download-guide.png"), fullPage: true });
});

test("가짜 ポートフォリオ를 올리면 일본주식의 수량·가격·합계가 맞고 새로고침 뒤에도 빈 상태 없이 남는다", async ({ page }) => {
  const { portfolioShiftJis } = await import("../lib/sbi/fixtures");
  await page.clock.install({ time: new Date("2026-10-28T09:00:00Z") });
  await page.goto("/");
  const input = page.getByLabel("SBI CSV 파일");
  await expect(input).toHaveAttribute("multiple", "");
  await input.setInputFiles({ name: "arbitrary-name.txt", mimeType: "text/plain", buffer: Buffer.from(portfolioShiftJis) });
  const japan = page.getByRole("region", { name: "일본 증권사", exact: true });
  const sbi = japan.getByRole("region", { name: "SBI증권", exact: true });
  const table = sbi.getByRole("table", { name: "일본주식 보유 종목" });
  const jpA = table.getByRole("row").filter({ hasText: "JP-A" });
  await expect(jpA.getByRole("cell")).toHaveText(["JP-A特定1111", "10", "¥1,000", "¥1,200", "¥12,000", "+¥2,000+20.00%", "+¥500+4.35%"]);
  const jpB = table.getByRole("row").filter({ hasText: "JP-B" });
  await expect(jpB.getByRole("cell")).toHaveText(["JP-B特定999A", "10", "¥900", "¥800", "¥8,000", "-¥1,000-11.11%", "-¥200-2.44%"]);
  await expect(jpA.getByText("JP-A", { exact: true })).toHaveAttribute("lang", "ja");
  await expect(jpA.getByText("特定", { exact: true })).toHaveAttribute("lang", "ja");
  await expect(table.getByRole("row").filter({ hasText: "일본주식 합계" })).toContainText("¥20,000");
  const summary = page.getByRole("region", { name: "자산 요약" });
  await expect(summary).toContainText("¥20,000");
  await expect(summary).toContainText("+¥1,000");
  await expect(summary.getByText("현금 제외", { exact: true })).toBeVisible();
  await expect(summary).toContainText("마지막 업로드 0일 전");
  await expect(sbi.getByRole("button", { name: /SBI증권 엔화 총액/ })).toContainText("¥20,000");
  await expect(sbi.getByRole("status")).toContainText("반영됨");
  await expect(sbi.getByRole("status")).toContainText("arbitrary-name.txt");
  const reopen = sbi.getByRole("button", { name: "CSV 올리기", exact: true });
  await expect(reopen).toHaveAttribute("aria-expanded", "false");
  await expect(sbi.getByRole("heading", { name: "CSV 올리기 안내" })).toHaveCount(0);
  await expect(sbi.getByText("SBI 카드에 CSV 파일을 끌어다 놓을 수 있습니다. CSV 올리기 버튼으로 파일 선택과 다운로드 안내를 다시 열 수 있습니다.", { exact: true })).toBeVisible();
  await expect(sbi.getByRole("region", { name: "미국주식", exact: true })).toContainText("約定履歴 CSV를 올리면 보입니다.");
  await reopen.click();
  await expect(reopen).toHaveAttribute("aria-expanded", "true");
  await expect(sbi.getByRole("heading", { name: "約定履歴", exact: true })).toBeVisible();
  await expect(table.getByText("JP-A", { exact: true })).toBeVisible();
  await reopen.click();
  await page.addInitScript(() => {
    Object.assign(window, { emptyStateFlashed: false });
    new MutationObserver(() => {
      if (document.body?.textContent?.includes("CSV 올리기 안내")) Object.assign(window, { emptyStateFlashed: true });
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  await expect(table.getByText("JP-A", { exact: true })).toBeVisible();
  await expect(table.getByText("JP-B", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "emptyStateFlashed"))).toBe(false);
  await expect(sbi.getByRole("button", { name: "CSV 올리기", exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("portfolio.png"), fullPage: true });
});

test("다시 올리면 일본주식 전체와 업로드 시각을 바꾸고 다른 탭에도 반영한다", async ({ page, context }) => {
  const { portfolioUtf8 } = await import("../lib/sbi/fixtures");
  // Both tabs share one clock; freeze Date while allowing browser timers to run.
  await context.clock.setFixedTime(new Date("2026-10-25T09:00:00Z"));
  await page.goto("/");
  await page.getByLabel("SBI CSV 파일").setInputFiles({ name: "first.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioUtf8) });
  await expect(page.getByRole("table").getByText("JP-B", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "자산 요약" }).locator("time")).toHaveAttribute("datetime", "2026-10-25T09:00:00.000Z");
  await context.clock.setFixedTime(new Date("2026-10-28T09:00:00Z"));
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("region", { name: "자산 요약" })).toContainText("마지막 업로드 3일 전");
  await page.getByRole("button", { name: "CSV 올리기", exact: true }).click();
  const replacement = "ポートフォリオ一覧\n株式(現物/NISA預り)\n銘柄(コード),数量,取得単価,現在値\n1111 JP-A,10,1000,1200";
  await page.getByLabel("SBI CSV 파일").setInputFiles({ name: "replacement.csv", mimeType: "text/csv", buffer: Buffer.from(replacement) });
  for (const tab of [page, other]) {
    const table = tab.getByRole("table", { name: "일본주식 보유 종목" });
    await expect(table.getByText("JP-B", { exact: true })).toHaveCount(0);
    await expect(table.getByText("JP-A", { exact: true })).toBeVisible();
    await expect(table.getByText("NISA", { exact: true })).toBeVisible();
    await expect(tab.getByRole("region", { name: "자산 요약" })).toContainText("¥12,000");
    await expect(tab.getByRole("region", { name: "자산 요약" })).toContainText("마지막 업로드 0일 전");
    await expect(tab.getByRole("region", { name: "자산 요약" }).locator("time")).toHaveAttribute("datetime", "2026-10-28T09:00:00.000Z");
  }
});

test("파일 여러 개를 함께 받고 같은 종목의 特定·NISA를 별도 행으로 보인다", async ({ page }) => {
  const { usTradesUtf8 } = await import("../lib/sbi/fixtures");
  await page.goto("/");
  const accounts = "ポートフォリオ一覧\n株式(現物/特定預り)\n銘柄(コード),数量,取得単価,現在値\n1111 JP-A,10,1000,1200\n株式(現物/NISA預り)\n銘柄(コード),数量,取得単価,現在値\n1111 JP-A,10,1000,1200";
  await page.getByLabel("SBI CSV 파일").setInputFiles([
    { name: "one.txt", mimeType: "text/plain", buffer: Buffer.from(accounts) },
    { name: "two.txt", mimeType: "text/plain", buffer: Buffer.from(usTradesUtf8) },
  ]);
  const table = page.getByRole("table", { name: "일본주식 보유 종목" });
  await expect(table.getByRole("row").filter({ hasText: "JP-A" })).toHaveCount(2);
  await expect(table.getByText("特定", { exact: true })).toBeVisible();
  await expect(table.getByText("NISA", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("status")).toContainText("one.txt");
  await expect(page.getByRole("status")).toContainText("two.txt");
});

for (const [label, unreadable] of [
  ["깨진 JSON", "{broken-json"],
  ["지원하지 않는 저장 형식", JSON.stringify({ version: 999 })],
]) {
  test.describe(label, () => {
    // Seed before navigation: a mounted page could recover the value before a reload.
    test.use({
      storageState: { cookies: [], origins: [{
        origin: "http://localhost:3000", localStorage: [{ name: "trizon", value: unreadable }],
      }] },
    });
    test("원본을 보관하고 새 CSV 업로드로 복구한다", async ({ page }) => {
      const { portfolioUtf8 } = await import("../lib/sbi/fixtures");
      await page.goto("/");
      await expect(page.getByRole("button", { name: "CSV 고르기", exact: true })).toBeVisible();
      await expect(page.getByRole("main").getByRole("alert")).toContainText("CSV를 다시 올려 주세요");
      expect(await page.evaluate(() => localStorage.getItem("trizon"))).toBeNull();
      expect(await page.evaluate(() => localStorage.getItem("trizon:backup"))).toBe(unreadable);
      await page.getByLabel("SBI CSV 파일").setInputFiles({
        name: "recovery.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioUtf8),
      });
      await expect(page.getByRole("table").getByText("JP-A", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("trizon:backup"))).toBe(unreadable);
      await page.reload();
      await expect(page.getByRole("table").getByText("JP-B", { exact: true })).toBeVisible();
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    });
  });
}

async function failSnapshotWrites(page: Page) {
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "trizon") throw new DOMException("Storage is full", "QuotaExceededError");
      setItem.call(this, key, value);
    };
  });
}

for (const replacing of [false, true]) {
  test(`저장 실패 시 ${replacing ? "교체한" : "처음 올린"} 보유를 화면에 남기고 새로고침 위험을 알린다`, async ({ page }) => {
    const { portfolioUtf8 } = await import("../lib/sbi/fixtures");
    await page.goto("/");
    if (replacing) {
      await page.getByLabel("SBI CSV 파일").setInputFiles({
        name: "original.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioUtf8),
      });
      await expect(page.getByRole("table").getByText("JP-B", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "CSV 올리기", exact: true }).click();
    }
    const persisted = await page.evaluate(() => localStorage.getItem("trizon"));
    await failSnapshotWrites(page);
    const incoming = replacing
      ? new TextEncoder().encode("ポートフォリオ一覧\n株式(現物/NISA預り)\n銘柄(コード),数量,取得単価,現在値\n1111 JP-A,10,1000,1200")
      : portfolioUtf8;
    await page.getByLabel("SBI CSV 파일").setInputFiles({
      name: "unsaved.csv", mimeType: "text/csv", buffer: Buffer.from(incoming),
    });
    await expect(page.getByRole("region", { name: "자산 요약" })).toContainText(replacing ? "¥12,000" : "¥20,000");
    await expect(page.getByRole("table").getByText("JP-A", { exact: true })).toBeVisible();
    await expect(page.getByRole("table").getByText("JP-B", { exact: true })).toHaveCount(replacing ? 0 : 1);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("저장되지 않았습니다. 새로고침하면 저장하지 못한 변경사항이 사라집니다.");
    await expect(page.getByRole("main").getByRole("status")).toContainText("unsaved.csv");
    expect(await page.evaluate(() => localStorage.getItem("trizon"))).toBe(persisted);
    await page.reload();
    if (replacing) {
      await expect(page.getByRole("table").getByText("JP-B", { exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: "CSV 고르기", exact: true })).toBeVisible();
    }
  });
}

test("저장 실패 뒤 다른 탭에서 저장한 보유를 받고 임시 보유와 경고를 해제한다", async ({ page, context }) => {
  const { portfolioUtf8 } = await import("../lib/sbi/fixtures");
  await page.goto("/");
  await failSnapshotWrites(page);
  await page.getByLabel("SBI CSV 파일").setInputFiles({
    name: "unsaved.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioUtf8),
  });
  await expect(page.getByRole("region", { name: "자산 요약" })).toContainText("¥20,000");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("저장되지 않았습니다");
  const other = await context.newPage();
  await other.goto("/");
  await other.getByLabel("SBI CSV 파일").setInputFiles({
    name: "saved.csv", mimeType: "text/csv",
    buffer: Buffer.from("ポートフォリオ一覧\n株式(現物/NISA預り)\n銘柄(コード),数量,取得単価,現在値\n1111 JP-A,10,1000,1200"),
  });
  await expect(page.getByRole("region", { name: "자산 요약" })).toContainText("¥12,000");
  await expect(page.getByRole("table").getByText("JP-B", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("복구 원본 보관에 실패하면 기존 저장값을 덮어쓰지 않고 새 보유만 화면에 보인다", async ({ page }) => {
  const { portfolioUtf8 } = await import("../lib/sbi/fixtures");
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("trizon", "{unreadable-original");
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith("trizon:backup")) throw new DOMException("Storage is full", "QuotaExceededError");
      setItem.call(this, key, value);
    };
    window.dispatchEvent(new StorageEvent("storage", { key: "trizon" }));
  });
  await page.getByLabel("SBI CSV 파일").setInputFiles({
    name: "recovery.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioUtf8),
  });
  await expect(page.getByRole("region", { name: "자산 요약" })).toContainText("¥20,000");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("저장되지 않았습니다");
  expect(await page.evaluate(() => localStorage.getItem("trizon"))).toBe("{unreadable-original");
});

test("다시 복구할 때 이전 원본 보관값도 유지한다", async ({ page }) => {
  const { portfolioUtf8 } = await import("../lib/sbi/fixtures");
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("trizon:backup", "{older-original");
    localStorage.setItem("trizon", "{newer-original");
  });
  await page.reload();
  await page.getByLabel("SBI CSV 파일").setInputFiles({
    name: "recovery.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioUtf8),
  });
  await expect(page.getByRole("table").getByText("JP-A", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.values(localStorage))).toEqual(expect.arrayContaining(["{older-original", "{newer-original"]));
});
