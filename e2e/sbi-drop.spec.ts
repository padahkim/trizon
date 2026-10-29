import { expect, test, type Page } from "@playwright/test";
import { portfolioCsv, usTradesCsv } from "../lib/sbi/fixtures";

async function transfer(page: Page, files: { name: string; contents: string }[]) {
  return page.evaluateHandle((files) => {
    const data = new DataTransfer();
    for (const file of files) data.items.add(new File([file.contents], file.name, { type: "text/csv" }));
    return data;
  }, files);
}

test.beforeEach(async ({ context }) => {
  await context.route("**/api/quotes?*", (route) => route.fulfill({ json: { quotes: {} } }));
});

test("업로드 칸을 열지 않아도 SBI 제목·보유표에 여러 CSV를 놓으면 한 번씩 반영된다", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("SBI CSV 파일").setInputFiles({ name: "first.csv", mimeType: "text/csv", buffer: Buffer.from(usTradesCsv) });
  const sbi = page.getByRole("region", { name: "SBI증권", exact: true });
  const us = sbi.getByRole("table", { name: "미국주식 보유 종목" });
  await expect(us.getByText("US-A", { exact: true })).toBeVisible();
  await expect(sbi.getByRole("button", { name: "CSV 올리기", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(sbi.getByRole("heading", { name: "CSV 올리기 안내" })).toHaveCount(0);
  const updated = usTradesCsv + "2026/10/02,US-A,TSTA,米国株式,現買,特定,5,130USD,2026/10/06,650USD\r\n";
  const dataTransfer = await transfer(page, [
    { name: "portfolio.csv", contents: portfolioCsv }, { name: "trades.csv", contents: updated },
  ]);
  const title = sbi.getByRole("heading", { name: "SBI증권", exact: true });
  await title.dispatchEvent("dragenter", { dataTransfer });
  const prompt = sbi.getByText("CSV 파일을 여기에 놓으세요.", { exact: true });
  await expect(prompt).toBeVisible();
  await expect(sbi).toHaveCSS("outline-style", "solid");
  // Crossing a child element must not briefly dismiss the card's drop feedback.
  await us.getByText("US-A", { exact: true }).dispatchEvent("dragenter", { dataTransfer });
  await title.dispatchEvent("dragleave", { dataTransfer });
  await expect(prompt).toBeVisible();
  await sbi.screenshot({ path: test.info().outputPath("sbi-card-drag.png") });
  await us.dispatchEvent("dragover", { dataTransfer });
  await us.dispatchEvent("drop", { dataTransfer });
  await expect(prompt).toHaveCount(0);
  await expect(sbi).toHaveCSS("outline-style", "none");
  await expect(us.getByRole("row").filter({ hasText: "US-A" }).getByRole("cell").nth(1)).toHaveText("9");
  await expect(sbi.getByRole("table", { name: "일본주식 보유 종목" }).getByText("JP-A", { exact: true })).toBeVisible();
  await expect(sbi.getByLabel("업로드 결과").getByRole("listitem")).toHaveCount(2);
  await expect(sbi.getByRole("heading", { name: "CSV 올리기 안내" })).toHaveCount(0);
  await sbi.screenshot({ path: test.info().outputPath("sbi-card-imported.png") });
  await page.reload();
  await expect(us.getByRole("row").filter({ hasText: "US-A" }).getByRole("cell").nth(1)).toHaveText("9");
});

test("텍스트 드래그는 무시하고 파일이 카드를 벗어나면 안내를 닫으며 업로드 칸 위 드롭도 처리한다", async ({ page }) => {
  await page.goto("/");
  const sbi = page.getByRole("region", { name: "SBI증권", exact: true });
  await expect(sbi.getByRole("button", { name: "CSV 고르기", exact: true })).toBeVisible();
  const prompt = sbi.getByText("CSV 파일을 여기에 놓으세요.", { exact: true });
  const text = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData("text/plain", "US-A");
    return data;
  });
  await sbi.dispatchEvent("dragenter", { dataTransfer: text });
  await sbi.dispatchEvent("dragover", { dataTransfer: text });
  await sbi.dispatchEvent("drop", { dataTransfer: text });
  await expect(prompt).toHaveCount(0);
  await expect(sbi.getByLabel("업로드 결과")).toHaveCount(0);
  const dataTransfer = await transfer(page, [
    { name: "trades.csv", contents: usTradesCsv }, { name: "unsupported.txt", contents: "not an SBI file" },
  ]);
  await sbi.dispatchEvent("dragenter", { dataTransfer });
  await expect(prompt).toBeVisible();
  await sbi.dispatchEvent("dragleave", { dataTransfer });
  await expect(prompt).toHaveCount(0);
  await expect(sbi).toHaveCSS("outline-style", "none");
  const picker = sbi.getByRole("button", { name: "CSV 고르기", exact: true });
  await picker.dispatchEvent("dragenter", { dataTransfer });
  await expect(prompt).toBeVisible();
  await picker.dispatchEvent("drop", { dataTransfer });
  await expect(sbi.getByRole("table", { name: "미국주식 보유 종목" }).getByText("US-A", { exact: true })).toBeVisible();
  const results = sbi.getByLabel("업로드 결과");
  await expect(results.getByRole("listitem")).toHaveCount(2);
  await expect(results.getByRole("listitem").filter({ hasText: "unsupported.txt" })).toContainText("읽지 못함");
  await expect(results.getByRole("listitem").filter({ hasText: "trades.csv" })).toContainText("반영됨");
});

test("파일을 읽는 동안에는 추가 드롭을 받지 않는다", async ({ page }) => {
  await page.goto("/");
  const sbi = page.getByRole("region", { name: "SBI증권", exact: true });
  await expect(sbi.getByRole("button", { name: "CSV 고르기", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    let first = true;
    File.prototype.arrayBuffer = async function () {
      if (first) {
        first = false;
        await new Promise<void>((resolve) => { Reflect.set(window, "finishDropRead", resolve); });
      }
      return read.call(this);
    };
  });
  const first = await transfer(page, [{ name: "portfolio.csv", contents: portfolioCsv }]);
  await sbi.dispatchEvent("drop", { dataTransfer: first });
  await expect(sbi).toHaveAttribute("aria-busy", "true");
  await expect(sbi.getByRole("button", { name: "읽는 중", exact: true })).toBeDisabled();
  const second = await transfer(page, [{ name: "trades.csv", contents: usTradesCsv }]);
  await sbi.dispatchEvent("dragenter", { dataTransfer: second });
  await sbi.dispatchEvent("dragover", { dataTransfer: second });
  await expect(sbi.getByText("CSV 파일을 여기에 놓으세요.", { exact: true })).toHaveCount(0);
  await sbi.dispatchEvent("drop", { dataTransfer: second });
  await page.evaluate(() => Reflect.get(window, "finishDropRead")());
  await expect(sbi).toHaveAttribute("aria-busy", "false");
  await expect(sbi.getByRole("table", { name: "일본주식 보유 종목" }).getByText("JP-A", { exact: true })).toBeVisible();
  await expect(sbi.getByRole("table", { name: "미국주식 보유 종목" })).toHaveCount(0);
  await expect(sbi.getByLabel("업로드 결과").getByRole("listitem")).toHaveCount(1);
});
