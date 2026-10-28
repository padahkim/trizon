import { expect, test, type Page } from "@playwright/test";
import { portfolioUtf8, usTradesUtf8 } from "../lib/sbi/fixtures";

async function uploadBoth(page: Page) {
  await page.goto("/");
  await page.getByLabel("SBI CSV 파일").setInputFiles([
    { name: "portfolio.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioUtf8) },
    { name: "trades.csv", mimeType: "text/csv", buffer: Buffer.from(usTradesUtf8) },
  ]);
  await expect(page.getByRole("table")).toHaveCount(2);
}

test("지우기 확인 창은 취소에 포커스를 두고 취소·Esc·스크림은 보유를 유지하며 확정하면 빈 대시보드로 돌아간다", async ({ page, context }) => {
  await uploadBoth(page);
  const persisted = await page.evaluate(() => localStorage.getItem("trizon"));
  await page.evaluate(() => localStorage.setItem("trizon:backup", "{older-original"));
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("table")).toHaveCount(2);
  const trigger = page.getByRole("button", { name: "데이터 지우기", exact: true });
  const dialog = page.getByRole("alertdialog", { name: "데이터를 지울까요?" });

  for (const cancel of ["button", "escape", "scrim"]) {
    await trigger.click();
    await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeFocused();
    await expect(dialog).toContainText("저장된 보유 내역과 거래를 모두 지웁니다.");
    await expect(dialog.getByRole("note")).toHaveText("2년보다 오래된 거래는 SBI에서 다시 받을 수 없습니다.");
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "데이터 지우기", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeFocused();
    if (cancel === "button") await dialog.getByRole("button", { name: "취소", exact: true }).click();
    else if (cancel === "escape") await page.keyboard.press("Escape");
    else await page.mouse.click(16, 16);
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem("trizon"))).toBe(persisted);
    await expect(page.getByRole("table")).toHaveCount(2);
  }

  await trigger.click();
  await page.screenshot({ path: test.info().outputPath("clear-data-dialog.png"), animations: "disabled" });
  await dialog.getByRole("button", { name: "데이터 지우기", exact: true }).click();

  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("trizon"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("trizon:backup"))).toBeNull();
  for (const tab of [page, other]) {
    await expect(tab.getByRole("table")).toHaveCount(0);
    await expect(tab.getByRole("region", { name: "자산 요약" })).toHaveCount(0);
    await expect(tab.getByRole("heading", { name: "CSV 올리기 안내" })).toBeVisible();
    await expect(tab.getByText("연결된 증권사 없음", { exact: true })).toBeVisible();
    await expect(tab.getByRole("list", { name: "업로드 결과" })).toHaveCount(0);
  }
  await page.reload();
  await expect(page.getByRole("button", { name: "CSV 고르기", exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("저장 실패로 화면에만 남은 보유도 지우면 경고와 결과를 비우고 다시 올릴 수 있다", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "trizon") throw new DOMException("Storage full", "QuotaExceededError");
      setItem.call(this, key, value);
    };
  });
  await page.getByLabel("SBI CSV 파일").setInputFiles({ name: "unsaved.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioUtf8) });
  await expect(page.getByRole("table")).toHaveCount(1);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("저장되지 않았습니다");

  await page.getByRole("button", { name: "데이터 지우기", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "데이터 지우기", exact: true }).click();

  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "업로드 결과" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "CSV 고르기", exact: true })).toBeVisible();
  await page.getByLabel("SBI CSV 파일").setInputFiles({ name: "again.csv", mimeType: "text/csv", buffer: Buffer.from(usTradesUtf8) });
  await expect(page.getByRole("table", { name: "미국주식 보유 종목" })).toBeVisible();
  await expect(page.getByRole("table", { name: "일본주식 보유 종목" })).toHaveCount(0);
});

test("브라우저가 지우기를 거부하면 보유를 유지하고 확인 창에서 오류와 취소를 제공한다", async ({ page }) => {
  await uploadBoth(page);
  const persisted = await page.evaluate(() => localStorage.getItem("trizon"));
  await page.evaluate(() => {
    Storage.prototype.removeItem = () => { throw new DOMException("Storage denied", "SecurityError"); };
  });
  await page.getByRole("button", { name: "데이터 지우기", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "데이터 지우기", exact: true }).click();

  await expect(dialog.getByRole("alert")).toContainText("데이터를 지우지 못했습니다");
  expect(await page.evaluate(() => localStorage.getItem("trizon"))).toBe(persisted);
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(2);
});
