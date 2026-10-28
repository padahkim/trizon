import { expect, test, type Page } from "@playwright/test";
import { portfolioUtf8, usTradesCsv } from "../lib/sbi/fixtures";

const file = (csv: string) => ({ name: "trades.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
const usTable = (page: Page) => page.getByRole("table", { name: "미국주식 보유 종목" });

async function saveFields(page: Page, fields: Record<string, string>) {
  const form = page.getByRole("form", { name: "미국주식 보유정보 입력" });
  for (const [label, value] of Object.entries(fields)) await form.getByLabel(label, { exact: true }).fill(value);
  await form.getByRole("button", { name: "보유정보 저장", exact: true }).click();
}

test.beforeEach(async ({ context }) => {
  await context.route("**/api/quotes?*", (route) => route.fulfill({ json: { quotes: {} } }));
});

test("경고에서 현재 SBI 기준 보유정보를 입력하면 과거 거래를 다시 더하지 않고 복원한다", async ({ page }) => {
  await page.goto("/");
  const oversold = usTradesCsv.replace("現買", "現売").split("\r\n").slice(0, 3).join("\r\n");
  await page.getByLabel("SBI CSV 파일").setInputFiles(file(oversold));
  const warning = page.getByLabel("미국주식 계산 안내");
  await expect(warning).toContainText("2년 이전 매수분 필요");
  await warning.getByRole("button", { name: "보유정보 입력", exact: true }).click();
  const form = page.getByRole("form", { name: "미국주식 보유정보 입력" });
  await expect(form.getByLabel("종목 코드", { exact: true })).toHaveValue("TSTA");
  await expect(form.getByLabel("預り区分", { exact: true })).toHaveValue("特定");
  await form.getByLabel("기준일 (国内約定日)", { exact: true }).fill("2026-10-28");
  await form.getByLabel("保有数量", { exact: true }).fill("10");
  await form.getByLabel("取得単価(USD)", { exact: true }).fill("100");
  await form.getByRole("button", { name: "보유정보 저장", exact: true }).click();
  const row = usTable(page).getByRole("row").filter({ hasText: "US-A" });
  await expect(row.getByRole("cell").nth(1)).toHaveText("10");
  await expect(row.getByRole("cell").nth(2)).toHaveText("$100.00");
  await expect(row).toContainText("직접 입력 기준 2026-10-28");
  await expect(warning).toHaveCount(0);
  await page.reload();
  await expect(row.getByRole("cell").nth(1)).toHaveText("10");
  await expect(row.getByRole("cell").nth(2)).toHaveText("$100.00");
});

test("CSV 없는 종목을 0주로 등록하고 관리 화면에서 수정·삭제하며 취소할 수 있다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "보유정보 입력·관리", exact: true }).click();
  const form = page.getByRole("form", { name: "미국주식 보유정보 입력" });
  await form.getByLabel("종목 코드", { exact: true }).fill("TSTC");
  await form.getByLabel("종목명", { exact: true }).fill("US-C");
  await form.getByLabel("預り区分", { exact: true }).fill("NISA");
  await form.getByLabel("기준일 (国内約定日)", { exact: true }).fill("2026-10-28");
  await form.getByLabel("保有数量", { exact: true }).fill("0");
  await form.getByRole("button", { name: "보유정보 저장", exact: true }).click();
  await expect(usTable(page)).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "보유정보 입력·관리", exact: true }).click();
  const saved = page.getByRole("region", { name: "입력한 기준 보유정보" });
  await expect(saved).toContainText("0주");
  await saved.getByRole("button", { name: "TSTC NISA 기준 보유정보 수정", exact: true }).click();
  await form.getByLabel("保有数量", { exact: true }).fill("2");
  await form.getByLabel("取得単価(USD)", { exact: true }).fill("25.5");
  await form.getByRole("button", { name: "보유정보 저장", exact: true }).click();
  const row = usTable(page).getByRole("row").filter({ hasText: "US-C" });
  await expect(row.getByRole("cell").nth(1)).toHaveText("2");
  await expect(row.getByRole("cell").nth(2)).toHaveText("$25.50");
  await page.getByRole("button", { name: "보유정보 입력·관리", exact: true }).click();
  const remove = saved.getByRole("button", { name: "TSTC NISA 기준 보유정보 삭제", exact: true });
  await remove.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(row).toBeVisible();
  await remove.click();
  await dialog.getByRole("button", { name: "기준 보유정보 삭제", exact: true }).click();
  await expect(usTable(page)).toHaveCount(0);
  await page.reload();
  await expect(usTable(page)).toHaveCount(0);
});

test("잘못된 입력은 필드 옆 한국어 안내를 보이고 저장하지 않는다", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "보유정보 입력·관리", exact: true }).click();
  const form = page.getByRole("form", { name: "미국주식 보유정보 입력" });
  await form.getByRole("button", { name: "보유정보 저장", exact: true }).click();
  await expect(form.getByLabel("保有数量", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByText("0 이상의 보유수량을 입력해 주세요.", { exact: true })).toBeVisible();
  await expect(form.getByText("0 이상의 달러 취득단가를 입력해 주세요.", { exact: true })).toBeVisible();
  await expect(form.getByText("유효한 기준일을 입력해 주세요.", { exact: true })).toBeVisible();
  await expect(usTable(page)).toHaveCount(0);
});

test("경고 없는 종목 보정과 이후 매매·재업로드가 시세·평단·합계에 반영되고 삭제하면 원장으로 돌아간다", async ({ page, context }) => {
  await context.unroute("**/api/quotes?*");
  let requests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/quotes") requests++; });
  await page.goto("/");
  await page.getByLabel("SBI CSV 파일").setInputFiles(file(usTradesCsv));
  await expect(usTable(page).getByRole("row").filter({ hasText: "US-A" }).getByRole("cell").nth(3)).toHaveText("$45.50");
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "보유정보 입력·관리", exact: true }).click();
  await page.getByLabel("종목·계좌 선택", { exact: true }).selectOption({ label: "US-A (TSTA · 特定)" });
  expect(requests).toBe(1);
  await saveFields(page, { "기준일 (国内約定日)": "2026-10-28", "保有数量": "10", "取得単価(USD)": "100" });
  const summary = page.getByRole("region", { name: "자산 요약" });
  await expect(summary).toContainText("$505.00");
  await expect(summary).toContainText("-$535.00");
  const nextCsv = usTradesCsv + "2026/09/01,US-A,TSTA,米国株式,現売,特定,9,90USD,,810USD\r\n2026/10/28,US-A,TSTA,米国株式,現買,特定,10,100USD,,1000USD\r\n2026/10/29,US-A,TSTA,米国株式,現買,特定,5,130USD,,650USD\r\n2026/10/30,US-A,TSTA,米国株式,現売,特定,3,140USD,,420USD\r\n";
  await page.getByRole("button", { name: "CSV 올리기", exact: true }).click();
  await page.getByLabel("SBI CSV 파일").setInputFiles(file(nextCsv));
  const row = usTable(page).getByRole("row").filter({ hasText: "US-A" });
  await expect(row.getByRole("cell").nth(1)).toHaveText("12");
  await expect(row.getByRole("cell").nth(2)).toHaveText("$110.00");
  await expect(summary).toContainText("$596.00");
  await page.getByRole("button", { name: "CSV 올리기", exact: true }).click();
  await page.getByLabel("SBI CSV 파일").setInputFiles(file(nextCsv));
  await expect(row.getByRole("cell").nth(1)).toHaveText("12");
  await page.reload();
  await expect(row.getByRole("cell").nth(2)).toHaveText("$110.00");
  await expect(summary).toContainText("$596.00");
  const beforeRefresh = requests;
  await summary.getByRole("button", { name: "시세 새로고침", exact: true }).click();
  await expect.poll(() => requests).toBe(beforeRefresh + 1);
  await page.screenshot({ path: test.info().outputPath("baseline-holdings.png"), fullPage: true });
  await page.getByRole("button", { name: "보유정보 입력·관리", exact: true }).click();
  await page.getByRole("region", { name: "미국주식", exact: true }).screenshot({ path: test.info().outputPath("baseline-editor.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("baseline-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "TSTA 特定 기준 보유정보 삭제", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "TSTA 特定 기준 보유정보 삭제", exact: true }).click();
  await dialog.getByRole("button", { name: "기준 보유정보 삭제", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByLabel("미국주식 계산 안내")).toContainText("2년 이전 매수분 필요");
  await page.reload();
  await expect(page.getByLabel("미국주식 계산 안내")).toContainText("2년 이전 매수분 필요");
});

test("보유정보 저장 실패를 알리고 현재 세션의 연속 입력은 유지한다", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "trizon") throw new DOMException("full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "보유정보 입력·관리", exact: true }).click();
  await saveFields(page, { "종목 코드": "TSTA", "종목명": "US-A", "預り区分": "特定", "기준일 (国内約定日)": "2026-10-28", "保有数量": "1", "取得単価(USD)": "10" });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("저장되지 않았습니다");
  await expect(usTable(page).getByText("US-A", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "보유정보 입력·관리", exact: true }).click();
  await saveFields(page, { "종목 코드": "TSTB", "종목명": "US-B", "預り区分": "NISA", "기준일 (国内約定日)": "2026-10-28", "保有数量": "2", "取得単価(USD)": "20" });
  await expect(usTable(page).getByText("US-A", { exact: true })).toBeVisible();
  await expect(usTable(page).getByText("US-B", { exact: true })).toBeVisible();
  await page.reload();
  await expect(usTable(page)).toHaveCount(0);
});

test("다른 탭에서 입력한 관련 없는 기준 보유정보를 덮어쓰지 않는다", async ({ page, context }) => {
  const other = await context.newPage();
  await page.goto("/");
  await other.goto("/");
  await other.getByRole("button", { name: "보유정보 입력·관리", exact: true }).click();
  await page.getByRole("button", { name: "보유정보 입력·관리", exact: true }).click();
  await saveFields(page, { "종목 코드": "TSTA", "종목명": "US-A", "預り区分": "特定", "기준일 (国内約定日)": "2026-10-28", "保有数量": "1", "取得単価(USD)": "10" });
  await saveFields(other, { "종목 코드": "TSTB", "종목명": "US-B", "預り区分": "NISA", "기준일 (国内約定日)": "2026-10-28", "保有数量": "2", "取得単価(USD)": "20" });
  for (const tab of [page, other]) {
    await expect(usTable(tab).getByText("US-A", { exact: true })).toBeVisible();
    await expect(usTable(tab).getByText("US-B", { exact: true })).toBeVisible();
    await tab.reload();
    await expect(usTable(tab).getByText("US-A", { exact: true })).toBeVisible();
    await expect(usTable(tab).getByText("US-B", { exact: true })).toBeVisible();
  }
});

test("저장 실패한 수동 기준값은 다른 탭의 CSV 갱신 뒤에도 남고 다음 저장으로 복구한다", async ({ page, context }) => {
  await page.addInitScript(() => {
    Object.assign(window, { blockBaselineStorage: true });
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "trizon" && Reflect.get(window, "blockBaselineStorage")) throw new DOMException("full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "보유정보 입력·관리", exact: true }).click();
  await saveFields(page, { "종목 코드": "TSTA", "종목명": "US-A", "預り区分": "特定", "기준일 (国内約定日)": "2026-10-28", "保有数量": "1", "取得単価(USD)": "10" });
  const other = await context.newPage();
  await other.goto("/");
  await other.getByLabel("SBI CSV 파일").setInputFiles({ name: "portfolio.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioUtf8) });
  await expect(page.getByRole("table", { name: "일본주식 보유 종목" }).getByText("JP-A", { exact: true })).toBeVisible();
  await expect(usTable(page).getByText("US-A", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("저장되지 않았습니다");
  await page.evaluate(() => Object.assign(window, { blockBaselineStorage: false }));
  await page.getByRole("button", { name: "보유정보 입력·관리", exact: true }).click();
  await saveFields(page, { "종목 코드": "TSTB", "종목명": "US-B", "預り区分": "NISA", "기준일 (国内約定日)": "2026-10-28", "保有数量": "2", "取得単価(USD)": "20" });
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(usTable(other).getByText("US-A", { exact: true })).toBeVisible();
  await expect(usTable(other).getByText("US-B", { exact: true })).toBeVisible();
});
