import { expect, test } from "@playwright/test";
import { portfolioShiftJis, portfolioUtf8 } from "../lib/sbi/fixtures";

test("업로드 영역에 파일을 끌어다 놓는 중에는 테두리가 ink로 바뀐다", async ({ page }) => {
  await page.goto("/");
  const input = page.getByLabel("SBI CSV 파일");
  await expect(input).toHaveAttribute("accept", ".csv");
  const uploader = page.locator("#sbi-uploader");
  await expect(uploader).toBeVisible();
  await expect(uploader).toHaveClass(/border-line-strong/);

  // Trigger dragenter/dragover using real DataTransfer in browser
  await page.evaluate(() => {
    const el = document.querySelector("#sbi-uploader")!;
    const dt = new DataTransfer();
    el.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt }));
    el.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await expect(uploader).toHaveClass(/border-ink/);

  // Trigger dragleave
  await page.evaluate(() => {
    const el = document.querySelector("#sbi-uploader")!;
    const dt = new DataTransfer();
    el.dispatchEvent(new DragEvent("dragleave", { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await expect(uploader).toHaveClass(/border-line-strong/);
});

test("ポートフォリオ를 여러 개 올리면 읽지 못함 배지와 하나만 올리라는 안내를 보인다 (ARCHITECTURE 열린 질문 4)", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("SBI CSV 파일").setInputFiles([
    { name: "p1.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioUtf8) },
    { name: "p2.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioShiftJis) },
  ]);

  const sbi = page.getByRole("region", { name: "SBI증권", exact: true });
  const status = sbi.getByRole("status");
  await expect(status.getByRole("listitem")).toHaveCount(2);
  const items = status.getByRole("listitem");
  await expect(items.nth(0).getByText("읽지 못함", { exact: true })).toBeVisible();
  await expect(items.nth(0)).toContainText("하나만");
  await expect(items.nth(1).getByText("읽지 못함", { exact: true })).toBeVisible();
  await expect(items.nth(1)).toContainText("하나만");
});

test("깨진 파일은 읽지 못함 배지를 보이고 함께 올린 정상 파일은 반영한다 (U4)", async ({ page }) => {
  await page.goto("/");
  const broken = new Uint8Array([0xff, 0xff, 0xff]);
  await page.getByLabel("SBI CSV 파일").setInputFiles([
    { name: "broken.csv", mimeType: "text/csv", buffer: Buffer.from(broken) },
    { name: "valid.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioUtf8) },
  ]);

  const sbi = page.getByRole("region", { name: "SBI증권", exact: true });
  const status = sbi.getByRole("status");
  await expect(status).toContainText("broken.csv");
  await expect(status).toContainText("valid.csv");

  const brokenItem = status.getByRole("listitem").filter({ hasText: "broken.csv" });
  await expect(brokenItem.getByText("읽지 못함", { exact: true })).toBeVisible();

  const validItem = status.getByRole("listitem").filter({ hasText: "valid.csv" });
  await expect(validItem.getByText("반영됨", { exact: true })).toBeVisible();

  // Valid portfolio is reflected
  await expect(sbi.getByRole("table", { name: "일본주식 보유 종목" })).toBeVisible();
});

test("0행 ポートフォリオ는 실패가 아니고 일본주식 칸에 '보유 없음'이 보인다 (U45)", async ({ page }) => {
  await page.goto("/");
  const emptyPortfolio = `ポートフォリオ一覧
株式(現物/特定預り)
銘柄(コード),数量,取得単価,現在値
株式(現物/特定預り)合計
評価額,含み損益
0,0
`;
  await page.getByLabel("SBI CSV 파일").setInputFiles([
    { name: "empty-portfolio.csv", mimeType: "text/csv", buffer: Buffer.from(emptyPortfolio) },
  ]);

  const sbi = page.getByRole("region", { name: "SBI증권", exact: true });
  await expect(sbi.getByRole("status")).toContainText("반영됨");
  await expect(sbi.getByRole("heading", { name: "일본주식", level: 4 })).toBeVisible();
  await expect(sbi.getByText("보유 없음", { exact: true })).toBeVisible();
});

test("信用·投資信託 표는 건너뛰고 건너뛴 표 N개로 알린다 (U13)", async ({ page }) => {
  await page.goto("/");
  const portfolioWithSkipped = `ポートフォリオ一覧
株式(現物/特定預り)
銘柄(コード),数量,取得単価,現在値
1111 JP-A,10,1000,1200
株式(信用)
銘柄(コード),数量,建単価,現在値
1111 JP-A,10,1000,1200
投資信託
ファンド名,数量,取得単価,現在値
架空ファンド,10,1000,1200
`;
  await page.getByLabel("SBI CSV 파일").setInputFiles([
    { name: "skipped.csv", mimeType: "text/csv", buffer: Buffer.from(portfolioWithSkipped) },
  ]);

  const sbi = page.getByRole("region", { name: "SBI증권", exact: true });
  await expect(sbi.getByRole("status")).toContainText("건너뛴 표 2개");
  await expect(sbi.getByLabel("일본주식 계산 안내")).toContainText("건너뛴 표 2개");
});
