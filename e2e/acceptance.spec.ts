import { expect, test, type Page } from "@playwright/test";

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
  await expect(jpA.getByRole("cell")).toHaveText(["JP-A1111特定", "10", "¥1,000", "¥1,200CSV 現在値", "¥12,000", "+¥2,000+20.00%", "00.00%"]);
  const jpB = table.getByRole("row").filter({ hasText: "JP-B" });
  await expect(jpB.getByRole("cell")).toHaveText(["JP-B999A特定", "10", "¥900", "¥800CSV 現在値", "¥8,000", "-¥1,000-11.11%", "00.00%"]);
  await expect(jpA.getByText("JP-A", { exact: true })).toHaveAttribute("lang", "ja");
  await expect(jpA.getByText("特定", { exact: true })).toHaveAttribute("lang", "ja");
  await expect(table.getByRole("row").filter({ hasText: "일본주식 합계" })).toContainText("¥20,000");
  const summary = page.getByRole("region", { name: "자산 요약" });
  await expect(summary).toContainText("¥20,000");
  await expect(summary).toContainText("+¥1,000");
  await expect(summary.getByText("현금 제외", { exact: true })).toBeVisible();
  await expect(summary).toContainText("마지막 업로드 0일 전");
  await expect(japan.getByLabel("일본 증권사 소계")).toHaveText("¥20,000");
  await expect(sbi.getByRole("status")).toContainText("반영됨");
  await expect(sbi.getByRole("status")).toContainText("arbitrary-name.txt");
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
  const { portfolioUtf8 } = await import("../lib/sbi/fixtures");
  await page.goto("/");
  const accounts = "ポートフォリオ一覧\n株式(現物/特定預り)\n銘柄(コード),数量,取得単価,現在値\n1111 JP-A,10,1000,1200\n株式(現物/NISA預り)\n銘柄(コード),数量,取得単価,現在値\n1111 JP-A,10,1000,1200";
  await page.getByLabel("SBI CSV 파일").setInputFiles([
    { name: "one.txt", mimeType: "text/plain", buffer: Buffer.from(portfolioUtf8) },
    { name: "two.txt", mimeType: "text/plain", buffer: Buffer.from(accounts) },
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
  test(`${label}은 원본을 보관하고 새 CSV 업로드로 복구한다`, async ({ page }) => {
    const { portfolioUtf8 } = await import("../lib/sbi/fixtures");
    await page.goto("/");
    await page.evaluate((raw) => localStorage.setItem("trizon", raw), unreadable);
    await page.reload();
    await expect(page.getByRole("button", { name: "CSV 고르기", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("CSV를 다시 올려 주세요");
    expect(await page.evaluate(() => localStorage.getItem("trizon"))).toBe(unreadable);
    await page.getByLabel("SBI CSV 파일").setInputFiles({
      name: "recovery.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioUtf8),
    });
    await expect(page.getByRole("table").getByText("JP-A", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("trizon:backup"))).toBe(unreadable);
    await page.reload();
    await expect(page.getByRole("table").getByText("JP-B", { exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
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
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("저장되지 않았습니다. 새로고침하면 다시 올려야 합니다.");
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
