import { readFile } from "node:fs/promises";
import { z } from "zod";
import { createSerialQueue, isNotFound, writeFileAtomic } from "../store/fs-utils.ts";
import type { SbiImportKind, SbiKind } from "./types.ts";

// data/sbi-imports.json:
// - 기존 3종은 종류마다 마지막 CSV 원문 한 개
// - 미국주식 約定履歴는 기간을 나눈 여러 원문 + 사용자가 확인한 현재 잔고
// 파싱 결과 대신 원문을 두므로 파서를 고치면 CSV를 다시 넣지 않아도 반영된다.

const importSchema = z.object({
  fileName: z.string(),
  /** 브라우저가 알려 준 파일 수정 시각 = SBI 에서 받은 시각. 포트폴리오 CSV 에는 날짜가 없어서 기준가 날짜로 쓴다 */
  fileModifiedAt: z.string().nullable(),
  importedAt: z.string(),
  /** 디코딩한 CSV 원문 */
  text: z.string(),
});

const coreImportsSchema = z.object({
  realized: importSchema.optional(),
  portfolio: importSchema.optional(),
  dividends: importSchema.optional(),
});

export const sbiUsHoldingSchema = z.object({
  id: z.string().min(1),
  ticker: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?$/, "미국 티커 형식을 확인하세요").max(10),
  name: z.string().trim().min(1, "종목명을 입력하세요"),
  quantity: z.number().positive("보유수량은 0보다 커야 합니다"),
  avgCost: z.number().nonnegative("평균 취득단가는 0 이상이어야 합니다"),
  costCurrency: z.enum(["USD", "JPY"]),
  accountType: z.string().trim().min(1, "계좌구분을 입력하세요"),
  source: z.enum(["inferred", "manual"]),
});

export const sbiUsHoldingsSchema = z
  .array(sbiUsHoldingSchema)
  .max(500, "보유종목은 500개까지 저장할 수 있습니다")
  .superRefine((rows, ctx) => {
    const ids = new Set<string>();
    const pairs = new Set<string>();
    for (const [index, row] of rows.entries()) {
      if (ids.has(row.id)) ctx.addIssue({ code: "custom", path: [index, "id"], message: "행 ID가 중복되었습니다" });
      ids.add(row.id);
      const pair = `${row.ticker}|${row.accountType}`;
      if (pairs.has(pair)) ctx.addIssue({ code: "custom", path: [index, "ticker"], message: "같은 티커와 계좌구분이 이미 있습니다" });
      pairs.add(pair);
    }
  });

const usTradeFileSchema = importSchema.extend({ fingerprint: z.string().min(1) });
const usTradeStateSchema = z.object({
  files: z.array(usTradeFileSchema).max(100),
  holdings: sbiUsHoldingsSchema,
  needsReview: z.boolean(),
  confirmedAt: z.string().nullable(),
});

const fileSchemaV1 = z.object({ version: z.literal(1), imports: coreImportsSchema });
const fileSchemaV2 = z.object({ version: z.literal(2), imports: coreImportsSchema, usTrades: usTradeStateSchema.optional() });

export type SbiImport = z.infer<typeof importSchema>;
export type SbiUsTradeFile = z.infer<typeof usTradeFileSchema>;
export type SbiUsTradeState = z.infer<typeof usTradeStateSchema>;
export type SbiCoreImports = Partial<Record<SbiKind, SbiImport>>;
export type SbiImports = SbiCoreImports & { usTrades?: SbiUsTradeState };

/** 저장 파일이 깨졌을 때. portfolio.json 과 같은 규칙으로 파일은 건드리지 않는다. */
export class SbiImportFileError extends Error {
  readonly filePath: string;
  readonly details: string[];
  constructor(filePath: string, message: string, details: string[] = []) {
    super(message);
    this.name = "SbiImportFileError";
    this.filePath = filePath;
    this.details = details;
  }
}

export interface SbiImportStore {
  load(): Promise<SbiImports>;
  /** 넘긴 기존 3종만 바꾸고 나머지는 그대로 둔다 */
  put(entries: SbiCoreImports): Promise<SbiImports>;
  /** 직렬 큐 안에서 미국주식 파일·보정 잔고를 원자적으로 갱신한다 */
  updateUsTrades(update: (current: SbiUsTradeState | undefined) => SbiUsTradeState | undefined): Promise<SbiImports>;
  remove(kind: SbiImportKind): Promise<SbiImports>;
}

export function createSbiImportStore(filePath: string): SbiImportStore {
  const serial = createSerialQueue();

  async function read(): Promise<SbiImports> {
    let text: string;
    try {
      text = await readFile(filePath, "utf8");
    } catch (err) {
      if (isNotFound(err)) return {};
      throw err;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new SbiImportFileError(filePath, "SBI CSV 저장 파일의 JSON 형식이 깨져 있습니다", [String(err)]);
    }

    const version = typeof json === "object" && json !== null && "version" in json ? (json as { version?: unknown }).version : undefined;
    const schema = version === 1 ? fileSchemaV1 : fileSchemaV2;
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new SbiImportFileError(
        filePath,
        "SBI CSV 저장 파일의 내용이 형식과 맞지 않습니다",
        parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
      );
    }
    return parsed.data.version === 1 ? parsed.data.imports : { ...parsed.data.imports, ...(parsed.data.usTrades ? { usTrades: parsed.data.usTrades } : {}) };
  }

  const write = (all: SbiImports) => {
    const { usTrades, ...imports } = all;
    return writeFileAtomic(filePath, `${JSON.stringify({ version: 2, imports, ...(usTrades ? { usTrades } : {}) }, null, 2)}\n`);
  };

  return {
    load: () => serial(read),
    put: (entries) =>
      serial(async () => {
        const next = { ...(await read()), ...entries };
        await write(next);
        return next;
      }),
    updateUsTrades: (update) =>
      serial(async () => {
        const current = await read();
        const proposed = update(current.usTrades);
        const usTrades = proposed ? usTradeStateSchema.parse(proposed) : undefined;
        const { usTrades: _old, ...core } = current;
        const next = { ...core, ...(usTrades ? { usTrades } : {}) };
        await write(next);
        return next;
      }),
    remove: (kind) =>
      serial(async () => {
        const current = await read();
        let next: SbiImports;
        if (kind === "usTrades") {
          const { usTrades: _removed, ...rest } = current;
          next = rest;
        } else {
          const { [kind]: _removed, ...rest } = current;
          next = rest;
        }
        await write(next);
        return next;
      }),
  };
}
