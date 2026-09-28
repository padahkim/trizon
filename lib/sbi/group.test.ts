import { test } from "node:test";
import assert from "node:assert/strict";
import { groupDividendsByStock, perShareJpy, splitSecurityName } from "./group.ts";
import type { DividendItem } from "./types.ts";

const item = (date: string, name: string, amountJpy: number, extra: Partial<DividendItem> = {}): DividendItem => ({
  date,
  account: "特定/一般",
  product: "国内株式(現物)",
  name,
  quantity: 100,
  amountJpy,
  ...extra,
});

test("이름 뒤의 코드·티커를 떼어 낸다", () => {
  assert.deepEqual(splitSecurityName("トヨタ自動車 7203"), { name: "トヨタ自動車", code: "7203" });
  assert.deepEqual(splitSecurityName("ユナイテッドヘルス グループ UNH"), { name: "ユナイテッドヘルス グループ", code: "UNH" });
  assert.deepEqual(splitSecurityName("MSCI MSCI"), { name: "MSCI", code: "MSCI" });
  assert.deepEqual(splitSecurityName("キオクシア 285A"), { name: "キオクシア", code: "285A" });
  assert.deepEqual(splitSecurityName("全世界株式インデックス・ファンド"), { name: "全世界株式インデックス・ファンド", code: null });
});

test("같은 종목도 口座가 다르면 따로, 이름은 종목의 가장 최근 것 (사명 변경은 코드로 묶는다)", () => {
  const groups = groupDividendsByStock([
    item("2025-06-05", "LINEヤフー 4689", 700, { account: "旧NISA" }),
    item("2026-06-05", "LINEヤフー 4689", 4_380, { account: "NISA(成長投資枠)", quantity: 300 }),
    item("2023-06-02", "Zホールディングス 4689", 556, { account: "旧NISA", quantity: 200 }),
    item("2026-06-29", "長谷工コーポレーション 1808", 5_000),
    item("2024-06-11", "LINEヤフー 4689", 941, { product: "国内株式(信用)" }),
    item("2022-06-03", "Zホールディングス 4689", 300, { account: "特定/一般", quantity: 50 }),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.product, g.code, g.account, g.name, g.quantity, g.amountJpy, g.items.length]),
    [
      // 4689 현물 합계 5,936 > 1808 5,000 — 같은 종목의 口座들은 붙여서, 금액이 큰 口座부터
      ["国内株式(現物)", "4689", "NISA(成長投資枠)", "LINEヤフー", 300, 4_380, 1],
      ["国内株式(現物)", "4689", "旧NISA", "LINEヤフー", 100, 1_256, 2],
      ["国内株式(現物)", "4689", "特定/一般", "LINEヤフー", 50, 300, 1],
      ["国内株式(現物)", "1808", "特定/一般", "長谷工コーポレーション", 100, 5_000, 1],
      ["国内株式(信用)", "4689", "特定/一般", "LINEヤフー", 100, 941, 1],
    ],
  );
  assert.deepEqual(groups[0].otherNames, []);
  assert.deepEqual(groups[1].otherNames, ["Zホールディングス"]);
  assert.deepEqual(groups[2].otherNames, ["Zホールディングス"]);
  assert.deepEqual(groups[1].items.map((i) => i.date), ["2025-06-05", "2023-06-02"]);
});

test("1주당 받은 금액 (투자신탁·수량 없음은 null)", () => {
  assert.equal(perShareJpy(item("2026-06-30", "トヨタ自動車 7203", 1_000, { quantity: 50 })), 20);
  assert.equal(perShareJpy(item("2026-06-30", "トヨタ自動車 7203", 1_000, { quantity: null })), null);
  assert.equal(perShareJpy(item("2026-06-30", "全世界株式", 1_000, { product: "投資信託", quantity: 200_000 })), null);
});
