"use server";

import { randomUUID } from "node:crypto";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TRADE_CURRENCY } from "@/lib/domain/model.ts";
import { accountFormSchema, formDataToObject, holdingFormSchema, type Holding } from "@/lib/domain/schema.ts";
import { quoteSymbolCandidates } from "@/lib/domain/symbols.ts";
import { resolveCostBasisHome } from "@/lib/portfolio/cost-basis.ts";
import { getQuoteService, getStore } from "@/lib/server.ts";

export type FormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const fail = (message: string, fieldErrors?: FormState["fieldErrors"]): FormState => ({ ok: false, message, fieldErrors });

class ConflictError extends Error {}

export async function saveHolding(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = holdingFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fail("입력값을 확인하세요", z.flattenError(parsed.error).fieldErrors);
  const input = parsed.data;

  const store = getStore();
  const file = await store.load();
  const account = file.accounts.find((a) => a.id === input.accountId);
  if (!account) return fail("계좌를 찾을 수 없습니다", { accountId: ["계좌를 다시 고르세요"] });
  const existing = input.id ? file.holdings.find((h) => h.id === input.id) : undefined;
  if (input.id && !existing) return fail("이미 삭제된 종목입니다. 목록을 새로고침하세요");

  const symbol = quoteSymbolCandidates(input.market, input.code);
  if (!symbol.ok) return fail("종목코드를 확인하세요", { code: [symbol.error] });

  // 수정인데 종목이 그대로면 다시 조회하지 않는다 (시세 서버가 막혀도 수량·단가는 고칠 수 있게)
  let quoteSymbol: string;
  let name: string;
  if (existing && existing.market === input.market && existing.code === symbol.code) {
    quoteSymbol = existing.quoteSymbol;
    name = input.name || existing.name;
  } else {
    const resolved = await getQuoteService().resolve(symbol.candidates, TRADE_CURRENCY[input.market]);
    if (!resolved.ok) return fail("종목을 확인하지 못했습니다", { code: [resolved.error] });
    quoteSymbol = resolved.quote.symbol;
    name = input.name || resolved.quote.name || symbol.code;
  }

  const costBasis = resolveCostBasisHome({
    tradeCurrency: TRADE_CURRENCY[input.market],
    homeCurrency: account.homeCurrency,
    quantity: input.quantity,
    mode: input.costBasisMode,
    amount: input.costBasisAmount,
    unknown: input.costBasisUnknown,
  });
  if (!costBasis.ok) return fail("매입금액을 확인하세요", { costBasisAmount: [costBasis.error] });

  const holding: Holding = {
    id: existing?.id ?? `h_${randomUUID().slice(0, 8)}`,
    accountId: account.id,
    market: input.market,
    code: symbol.code,
    quoteSymbol,
    name,
    quantity: input.quantity,
    avgCost: input.avgCost,
    ...(costBasis.costBasisHome !== undefined ? { costBasisHome: costBasis.costBasisHome } : {}),
    updatedAt: new Date().toISOString(),
  };

  try {
    await store.update((current) => {
      const duplicate = current.holdings.some(
        (h) => h.accountId === holding.accountId && h.quoteSymbol === holding.quoteSymbol && h.id !== holding.id,
      );
      if (duplicate) throw new ConflictError(`${account.label}에 이미 ${quoteSymbol} 종목이 있습니다. 그 종목을 수정하세요`);
      const holdings = existing
        ? current.holdings.map((h) => (h.id === holding.id ? holding : h))
        : [...current.holdings, holding];
      return { ...current, holdings };
    });
  } catch (err) {
    if (err instanceof ConflictError) return fail("이미 등록된 종목입니다", { code: [err.message] });
    throw err;
  }

  revalidatePath("/");
  revalidatePath("/holdings");
  redirect("/holdings");
}

export async function deleteHolding(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await getStore().update((f) => ({ ...f, holdings: f.holdings.filter((h) => h.id !== id) }));
  revalidatePath("/");
  revalidatePath("/holdings");
  redirect("/holdings");
}

export async function addAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = accountFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return fail("입력값을 확인하세요", z.flattenError(parsed.error).fieldErrors);
  const { broker, label, homeCurrency } = parsed.data;
  await getStore().update((f) => ({
    ...f,
    accounts: [...f.accounts, { id: `${broker.toLowerCase()}-${randomUUID().slice(0, 6)}`, broker, label, homeCurrency }],
  }));
  revalidatePath("/");
  revalidatePath("/holdings");
  return { ok: true, message: `${label} 계좌를 추가했습니다` };
}

export async function deleteAccount(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  // 종목이 남아 있는 계좌는 지우지 않는다 (화면에서도 버튼을 막는다)
  await getStore().update((f) =>
    f.holdings.some((h) => h.accountId === id) ? f : { ...f, accounts: f.accounts.filter((a) => a.id !== id) },
  );
  revalidatePath("/");
  revalidatePath("/holdings");
}

export async function refreshQuotes(): Promise<void> {
  await getQuoteService().invalidate();
  refresh();
}
