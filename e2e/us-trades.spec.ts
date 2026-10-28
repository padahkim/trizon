import { expect, test } from "@playwright/test";
import { portfolioShiftJis, usTradesCsv, usTradesUtf8 } from "../lib/sbi/fixtures";

const tradeFile = (csv = usTradesCsv) => ({ name: "trades.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });

test("두 CSV를 한 번에 올리면 네 종목을 SBI증권의 시장별 표와 엔·달러 요약으로 보이고 복원한다", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("SBI CSV 파일").setInputFiles([
    { name: "holdings.txt", mimeType: "text/plain", buffer: Buffer.from(portfolioShiftJis) },
    { name: "renamed.txt", mimeType: "text/plain", buffer: Buffer.from(usTradesUtf8) },
  ]);
  const japan = page.getByRole("region", { name: "일본 증권사", exact: true });
  const sbi = japan.getByRole("region", { name: "SBI증권", exact: true });
  const jp = sbi.getByRole("table", { name: "일본주식 보유 종목" });
  const us = sbi.getByRole("table", { name: "미국주식 보유 종목" });
  await expect(jp.getByRole("row").filter({ hasText: "JP-A" }).getByRole("cell").nth(1)).toHaveText("10");
  await expect(jp.getByRole("row").filter({ hasText: "JP-A" }).getByRole("cell").nth(2)).toHaveText("¥1,000");
  await expect(jp.getByRole("row").filter({ hasText: "JP-B" }).getByRole("cell").nth(2)).toHaveText("¥900");
  await expect(jp.getByRole("row").filter({ hasText: "JP-B" }).getByRole("cell").nth(1)).toHaveText("10");
  await expect(us.getByRole("row").filter({ hasText: "US-A" }).getByRole("cell")).toHaveText([
    "US-ATSTA特定", "4", "$50.00", "—시세 없음", "$200.00", "00.00%", "00.00%",
  ]);
  await expect(us.getByRole("row").filter({ hasText: "US-B" }).getByRole("cell")).toHaveText([
    "US-BTSTB特定", "2", "$20.00", "—시세 없음", "$40.00", "00.00%", "00.00%",
  ]);
  await expect(sbi.getByText("約定履歴으로 추정한 값", { exact: true })).toBeVisible();
  await expect(us.getByRole("row").filter({ hasText: "미국주식 합계" })).toContainText("$240.00");
  const summary = page.getByRole("region", { name: "자산 요약" });
  await expect(summary).toContainText("엔 자산");
  await expect(summary).toContainText("달러 자산");
  await expect(summary).toContainText("¥20,000");
  await expect(summary).toContainText("$240.00");
  await expect(japan.getByLabel("일본 증권사 소계")).toContainText("$240.00");
  await expect(sbi.getByRole("status")).toContainText("미국주식 거래를 누적했습니다.");
  await page.reload();
  await expect(us.getByText("US-A", { exact: true })).toBeVisible();
  await expect(jp.getByText("JP-B", { exact: true })).toBeVisible();
  await expect(summary).toContainText("$240.00");
  await expect(sbi.getByText("約定履歴으로 추정한 값", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("us-trades.png"), fullPage: true });
});

test("미국 거래만 올려도 달러 요약이 생기고 재업로드·겹친 기간은 중복 없이 소수 취득단가를 보존한다", async ({ page }) => {
  await page.goto("/");
  const firstBuy = usTradesCsv.split("\r\n")[2];
  const identical = usTradesCsv + `${firstBuy}\r\n`;
  await page.getByLabel("SBI CSV 파일").setInputFiles(tradeFile(identical));
  const us = page.getByRole("table", { name: "미국주식 보유 종목" });
  const row = us.getByRole("row").filter({ hasText: "US-A" });
  await expect(row.getByRole("cell").nth(1)).toHaveText("8");
  await expect(page.getByRole("region", { name: "자산 요약" })).toContainText("$440.00");
  await page.getByRole("button", { name: "CSV 올리기", exact: true }).click();
  await page.getByLabel("SBI CSV 파일").setInputFiles(tradeFile(identical));
  await expect(row.getByRole("cell").nth(1)).toHaveText("8");
  await page.getByRole("button", { name: "CSV 올리기", exact: true }).click();
  await page.getByLabel("SBI CSV 파일").setInputFiles(tradeFile(identical + "2026/10/02,US-A,TSTA,米国株式,現買,特定,2,10.25USD,2026/10/06,20.50USD\r\n"));
  await expect(row.getByRole("cell").nth(1)).toHaveText("10");
  await expect(row.getByRole("cell").nth(2)).toHaveText("$42.05");
  await expect(page.getByRole("region", { name: "자산 요약" })).toContainText("$460.50");
  await page.reload();
  await expect(row.getByRole("cell").nth(2)).toHaveText("$42.05");
});

test("계산 불가 종목만 있어도 미국주식 안내가 새로고침 뒤 남고 이전 매수를 올리면 다시 계산한다", async ({ page }) => {
  await page.goto("/");
  const oversold = usTradesCsv.replace("現買", "現売").split("\r\n").slice(0, 3).join("\r\n");
  await page.getByLabel("SBI CSV 파일").setInputFiles(tradeFile(oversold));
  const us = page.getByRole("region", { name: "미국주식", exact: true });
  await expect(us.getByLabel("미국주식 계산 안내")).toHaveText("US-A (TSTA · 特定): 계산할 수 없음: 2년 이전 매수분 필요");
  await expect(us.getByRole("table")).toHaveCount(0);
  await page.reload();
  await expect(us.getByLabel("미국주식 계산 안내")).toContainText("계산할 수 없음: 2년 이전 매수분 필요");
  const prior = usTradesCsv.split("\r\n").slice(0, 2).join("\r\n") + "\r\n2026/09/01,US-A,TSTA,米国株式,現買,特定,6,25USD,2026/09/03,150USD";
  await page.getByLabel("SBI CSV 파일").setInputFiles(tradeFile(prior));
  await expect(us.getByLabel("미국주식 계산 안내")).toHaveCount(0);
  await expect(us.getByRole("row").filter({ hasText: "US-A" }).getByRole("cell").nth(1)).toHaveText("2");
  await expect(page.getByRole("region", { name: "자산 요약" })).toContainText("$50.00");
});

test("건너뛴 거래와 1,000건 한도를 결과에 알리고 필수 열이 없는 파일은 기존 보유를 유지한다", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("SBI CSV 파일").setInputFiles(tradeFile());
  const us = page.getByRole("table", { name: "미국주식 보유 종목" });
  await expect(us.getByText("US-A", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "CSV 올리기", exact: true }).click();
  await page.getByLabel("SBI CSV 파일").setInputFiles(tradeFile(usTradesCsv.replace("約定数量", "missing")));
  await expect(page.getByRole("status")).toContainText("읽지 못함");
  await expect(us.getByRole("row").filter({ hasText: "US-A" }).getByRole("cell").nth(1)).toHaveText("4");
  await page.getByRole("button", { name: "CSV 올리기", exact: true }).click();
  const unsupported = usTradesCsv.split("\r\n")[2].replace("現買", "信用新買");
  const capped = usTradesCsv.split("\r\n").slice(0, 2).join("\r\n") + "\r\n" + Array.from({ length: 1000 }, () => unsupported).join("\r\n");
  await page.getByLabel("SBI CSV 파일").setInputFiles(tradeFile(capped));
  await expect(page.getByRole("status")).toContainText("건너뛴 거래 1000건");
  await expect(page.getByRole("status")).toContainText("기간을 나눠 CSV를 다시 받아 올려 주세요.");
  await expect(us.getByRole("row").filter({ hasText: "US-A" }).getByRole("cell").nth(1)).toHaveText("4");
});

test("다른 탭의 변경 알림을 놓쳐도 파일을 읽는 동안 저장된 거래 위에 합친다", async ({ page, context }) => {
  await page.goto("/");
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("button", { name: "CSV 고르기", exact: true })).toBeVisible();
  await other.evaluate(() => {
    window.addEventListener("storage", (event) => event.stopImmediatePropagation(), true);
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      const bytes = await read.call(this);
      await new Promise<void>((resolve) => { Reflect.set(window, "finishFileRead", resolve); });
      return bytes;
    };
  });
  const header = usTradesCsv.split("\r\n").slice(0, 2).join("\r\n");
  await other.getByLabel("SBI CSV 파일").setInputFiles(tradeFile(header + "\r\n" + usTradesCsv.split("\r\n")[3]));
  await expect(other.getByRole("button", { name: "읽는 중", exact: true })).toBeVisible();
  await page.getByLabel("SBI CSV 파일").setInputFiles(tradeFile(header + "\r\n" + usTradesCsv.split("\r\n")[2]));
  await expect(page.getByRole("table").getByText("US-A", { exact: true })).toBeVisible();
  await other.evaluate(() => Reflect.get(window, "finishFileRead")());
  for (const tab of [page, other]) {
    const us = tab.getByRole("table", { name: "미국주식 보유 종목" });
    await expect(us.getByText("US-A", { exact: true })).toBeVisible();
    await expect(us.getByText("US-B", { exact: true })).toBeVisible();
    await expect(tab.getByRole("region", { name: "자산 요약" })).toContainText("$240.00");
  }
});
