import { expect, test } from "@playwright/test";
import { portfolioUtf8 } from "../lib/sbi/fixtures";

const currentQuotes = {
  "JP:1111": { price: 1200, previousClose: 1150, currency: "JPY", marketTime: "2026-10-28T06:00:00Z" },
  "JP:999A": { price: 800, previousClose: 820, currency: "JPY", marketTime: "2026-10-28T06:00:00Z" },
};

test("receives fake quotes, shows market times, and refreshes without replacing numbers while loading", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("SBI CSV 파일").setInputFiles({ name: "fake.txt", mimeType: "text/plain", buffer: Buffer.from(portfolioUtf8) });
  const table = page.getByRole("table", { name: "일본주식 보유 종목" });
  const a = table.getByRole("row").filter({ hasText: "JP-A" });
  await expect(a.getByRole("cell")).toHaveText(["JP-A1111特定", "10", "¥1,000", "¥1,200", "¥12,000", "+¥2,000+20.00%", "+¥500+4.35%"]);
  await expect(table.getByRole("row").filter({ hasText: "JP-B" }).getByRole("cell")).toHaveText([
    "JP-B999A特定", "10", "¥900", "¥800", "¥8,000", "-¥1,000-11.11%", "-¥200-2.44%",
  ]);
  await expect(table.getByRole("row").filter({ hasText: "일본주식 합계" }).getByRole("cell")).toHaveText([
    "일본주식 합계", "¥20,000", "+¥1,000+5.26%", "+¥300+1.52%",
  ]);
  const summary = page.getByRole("region", { name: "자산 요약" });
  await expect(summary).toContainText("+¥300");
  await expect(summary).toContainText("일본 시세 15:00");
  await expect(page.getByRole("region", { name: "일본주식", exact: true })).toContainText("일본 시세 15:00");
  await expect(page.getByText("CSV 現在値", { exact: true })).toHaveCount(0);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/quotes?*", async (route) => { await gate; await route.fulfill({ json: { quotes: {} } }); });
  await summary.getByRole("button", { name: "시세 새로고침" }).click();
  await expect(summary.getByRole("button", { name: "받는 중" })).toBeDisabled();
  await expect(summary).toContainText("+¥300");
  release();
  await expect(summary.getByRole("button", { name: "시세 새로고침" })).toBeEnabled();
  await expect(a).toContainText("CSV 現在値");
});

test("renders saved holdings while the initial quote request is pending", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T09:00:00Z"));
  await page.goto("/");
  await page.getByLabel("SBI CSV 파일").setInputFiles({ name: "fake.txt", mimeType: "text/plain", buffer: Buffer.from(portfolioUtf8) });
  await expect(page.getByRole("button", { name: "시세 새로고침" })).toBeEnabled();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/quotes?*", async (route) => { await gate; await route.fulfill({ json: { quotes: currentQuotes } }); });
  await page.reload();
  const summary = page.getByRole("region", { name: "자산 요약" });
  await expect(summary.getByRole("button", { name: "받는 중" })).toBeDisabled();
  await expect(summary).toContainText("¥20,000");
  await expect(page.getByRole("table").getByRole("row").filter({ hasText: "JP-A" })).toContainText("CSV 現在値");
  await expect(page.getByRole("heading", { name: "CSV 올리기 안내" })).toHaveCount(0);
  release();
  await expect(summary).toContainText("+¥300");
});

test("keeps missing and invalid quotes in totals using CSV then cost", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T09:00:00Z"));
  await page.route("**/api/quotes?*", (route) => route.fulfill({ json: { quotes: {
    "JP:1111": { ...currentQuotes["JP:1111"], currency: "USD" },
    "JP:999A": { ...currentQuotes["JP:999A"], marketTime: "2026-10-20T06:00:00Z" },
  } } }));
  await page.goto("/");
  const csv = "ポートフォリオ一覧\n株式(現物/特定預り)\n銘柄(コード),数量,取得単価,現在値\n1111 JP-A,10,1000,1200\n999A JP-B,10,900,--\n2222 JP-C,1,100,--";
  await page.getByLabel("SBI CSV 파일").setInputFiles({ name: "fallback.txt", mimeType: "text/plain", buffer: Buffer.from(csv) });
  await expect(page.getByRole("button", { name: "시세 새로고침" })).toBeEnabled();
  const table = page.getByRole("table");
  await expect(table.getByRole("row").filter({ hasText: "JP-A" })).toContainText("¥1,200CSV 現在値");
  await expect(table.getByRole("row").filter({ hasText: "JP-B" }).getByRole("cell")).toHaveText([
    "JP-B999A特定", "10", "¥900", "—시세 없음", "¥9,000", "00.00%", "00.00%",
  ]);
  await expect(table.getByRole("row").filter({ hasText: "JP-C" })).toContainText("—시세 없음");
  await expect(page.getByRole("region", { name: "자산 요약" })).toContainText("¥21,100");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

for (const failure of ["server", "offline", "timeout"]) {
  test(`values every holding at cost after ${failure} and recovers on refresh`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-28T09:00:00Z") });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/quotes?*", async (route) => {
      if (failure === "offline") return route.abort("internetdisconnected");
      if (failure === "server") return route.fulfill({ status: 502, json: { error: "failed" } });
      await gate;
      await route.fulfill({ json: { quotes: currentQuotes } }).catch(() => {});
    });
    await page.goto("/");
    await page.getByLabel("SBI CSV 파일").setInputFiles({ name: "fake.txt", mimeType: "text/plain", buffer: Buffer.from(portfolioUtf8) });
    const summary = page.getByRole("region", { name: "자산 요약" });
    if (failure === "timeout") {
      await expect(summary.getByRole("button", { name: "받는 중" })).toBeDisabled();
      await page.clock.fastForward(10_001);
      release();
    }
    const banner = page.getByRole("main").getByRole("alert");
    await expect(banner).toContainText("시세를 받지 못했습니다");
    await expect(banner).toContainText("모든 종목을 취득가로 표시합니다");
    await expect(summary).toContainText("¥19,000");
    await expect(page.getByRole("table").getByText("시세 없음", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("table").getByRole("row").filter({ hasText: "JP-A" }).getByRole("cell")).toHaveText([
      "JP-A1111特定", "10", "¥1,000", "—시세 없음", "¥10,000", "00.00%", "00.00%",
    ]);
    await expect(page.getByText("CSV 現在値", { exact: true })).toHaveCount(0);
    await page.unroute("**/api/quotes?*");
    let retry!: () => void;
    const retryGate = new Promise<void>((resolve) => { retry = resolve; });
    await page.route("**/api/quotes?*", async (route) => { await retryGate; await route.fulfill({ json: { quotes: currentQuotes } }); });
    await banner.getByRole("button", { name: "시세 새로고침" }).click();
    await expect(banner.getByRole("button", { name: "받는 중" })).toBeDisabled();
    await expect(summary).toContainText("¥19,000");
    retry();
    await expect(banner).toHaveCount(0);
    await expect(summary).toContainText("¥20,000");
    await expect(summary).toContainText("+¥300");
  });
}

test("aborts a superseded request and ignores its late response even if transport ignores cancellation", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T09:00:00Z"));
  await page.addInitScript(() => {
    const original = window.fetch;
    let requests = 0;
    window.fetch = (input, init) => {
      if (typeof input !== "string" || !input.startsWith("/api/quotes?")) return original(input, init);
      const result = (price: number) => Response.json({ quotes: {
        "JP:1111": { price, previousClose: 1150, currency: "JPY", marketTime: "2026-10-28T06:00:00Z" },
      } });
      if (++requests > 1) return Promise.resolve(result(1300));
      init?.signal?.addEventListener("abort", () => Reflect.set(window, "oldQuoteAborted", true));
      // Deliberately retain the response after abort to exercise late-response protection.
      return new Promise<Response>((resolve) => Reflect.set(window, "releaseOldQuote", () => resolve(result(500))));
    };
  });
  await page.goto("/");
  const file = { name: "fake.txt", mimeType: "text/plain", buffer: Buffer.from(portfolioUtf8) };
  await page.getByLabel("SBI CSV 파일").setInputFiles(file);
  const summary = page.getByRole("region", { name: "자산 요약" });
  await expect(summary.getByRole("button", { name: "받는 중" })).toBeDisabled();
  await page.getByRole("button", { name: "CSV 올리기", exact: true }).click();
  await page.clock.setFixedTime(new Date("2026-10-28T09:00:01Z"));
  await page.getByLabel("SBI CSV 파일").setInputFiles(file);
  await expect(summary).toContainText("¥21,000");
  expect(await page.evaluate(() => Reflect.get(window, "oldQuoteAborted"))).toBe(true);
  await page.evaluate(async () => {
    Reflect.get(window, "releaseOldQuote")();
    await new Promise(requestAnimationFrame);
  });
  await expect(summary).toContainText("¥21,000");
});
