import { z } from "zod";
import { BROKERS, CURRENCIES, MARKETS } from "./model.ts";

// 저장 파일(data/portfolio.json)과 폼 입력이 같은 스키마를 공유한다. 타입은 z.infer 가 단일 출처.

export const accountSchema = z.object({
  id: z.string().min(1),
  broker: z.enum(BROKERS),
  label: z.string().trim().min(1),
  homeCurrency: z.enum(CURRENCIES),
});

export const holdingSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  market: z.enum(MARKETS),
  /** 사용자가 입력한 코드 (005930 / 7203 / 285A / BRK.B) */
  code: z.string().min(1),
  /** 확정된 시세 조회 심볼 (005930.KS / 7203.T / BRK-B) */
  quoteSymbol: z.string().min(1),
  name: z.string(),
  /** 소수 허용 (미국 소수점 주식) */
  quantity: z.number().positive(),
  /** 거래통화 기준 1주 평균단가. 0 = 리워드 주식 등 */
  avgCost: z.number().nonnegative(),
  /** 계좌통화 기준 "총" 매입금액. 거래통화 ≠ 계좌통화일 때만 쓴다. 없으면 환율효과 미반영 */
  costBasisHome: z.number().nonnegative().optional(),
  updatedAt: z.string(),
});

export const portfolioFileSchema = z
  .object({
    // 나중에 cash 등을 붙일 때 migrate() 를 거는 자리
    version: z.literal(1),
    accounts: z.array(accountSchema),
    holdings: z.array(holdingSchema),
  })
  .superRefine((file, ctx) => {
    const accountIds = new Set<string>();
    for (const a of file.accounts) {
      if (accountIds.has(a.id)) ctx.addIssue({ code: "custom", message: `계좌 id 중복: ${a.id}` });
      accountIds.add(a.id);
    }
    const holdingIds = new Set<string>();
    const pairs = new Set<string>();
    for (const h of file.holdings) {
      if (!accountIds.has(h.accountId)) {
        ctx.addIssue({ code: "custom", message: `없는 계좌를 참조하는 종목: ${h.id} → ${h.accountId}` });
      }
      if (holdingIds.has(h.id)) ctx.addIssue({ code: "custom", message: `종목 id 중복: ${h.id}` });
      holdingIds.add(h.id);
      const pair = `${h.accountId}|${h.quoteSymbol}`;
      if (pairs.has(pair)) {
        ctx.addIssue({ code: "custom", message: `같은 계좌에 같은 종목이 두 번 있음: ${h.accountId} ${h.quoteSymbol}` });
      }
      pairs.add(pair);
    }
  });

export type Account = z.infer<typeof accountSchema>;
export type Holding = z.infer<typeof holdingSchema>;
export type PortfolioFile = z.infer<typeof portfolioFileSchema>;

// ── 폼 입력 (FormData 의 문자열) ─────────────────────────────────────────────

/** 증권사 화면에서 복사한 "1,234,567" / " 12.5 " 를 숫자로. 빈 칸은 undefined. */
function toNumber(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const s = value.replace(/[,\s]/g, "");
  if (s === "") return undefined;
  return Number(s);
}

const numberError = (label: string) => ({ error: `${label}: 숫자를 입력하세요` });

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const holdingFormSchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  accountId: z.string({ error: "계좌를 고르세요" }).min(1, "계좌를 고르세요"),
  market: z.enum(MARKETS, { error: "시장을 고르세요" }),
  code: z.string({ error: "종목코드를 입력하세요" }).trim().min(1, "종목코드를 입력하세요"),
  name: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string()),
  quantity: z.preprocess(toNumber, z.number(numberError("수량")).positive("수량은 0보다 커야 합니다")),
  avgCost: z.preprocess(toNumber, z.number(numberError("평균단가")).nonnegative("평균단가는 0 이상이어야 합니다")),
  costBasisMode: z.enum(["total", "perShare"]).default("total"),
  costBasisAmount: z.preprocess(
    toNumber,
    z.number(numberError("매입금액")).nonnegative("매입금액은 0 이상이어야 합니다").optional(),
  ),
  costBasisUnknown: checkbox,
});
export type HoldingFormInput = z.infer<typeof holdingFormSchema>;

export const accountFormSchema = z.object({
  broker: z.enum(BROKERS, { error: "증권사를 고르세요" }),
  label: z.string().trim().min(1, "계좌 이름을 입력하세요"),
  homeCurrency: z.enum(CURRENCIES, { error: "계좌 통화를 고르세요" }),
});
export type AccountFormInput = z.infer<typeof accountFormSchema>;

/** FormData → 스키마 입력용 plain object (체크박스는 없으면 키 자체가 빠진다) */
export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value;
  }
  return out;
}
