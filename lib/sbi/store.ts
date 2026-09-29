import { readFile } from "node:fs/promises";
import { z } from "zod";
import { createSerialQueue, isNotFound, writeFileAtomic } from "../store/fs-utils.ts";
import type { SbiKind } from "./types.ts";

// data/sbi-imports.json: 종류마다 마지막으로 넣은 SBI CSV 원문 한 개씩.
// 파싱 결과가 아니라 원문을 두고 읽을 때마다 파싱한다 (parse.ts 의 parseImports).

const importSchema = z.object({
  fileName: z.string(),
  /** 브라우저가 알려 준 파일 수정 시각 = SBI 에서 받은 시각. 포트폴리오 CSV 에는 날짜가 없어서 기준가 날짜로 쓴다 */
  fileModifiedAt: z.string().nullable(),
  importedAt: z.string(),
  /** 디코딩한 CSV 원문 */
  text: z.string(),
});

const fileSchema = z.object({
  version: z.literal(1),
  imports: z.object({
    realized: importSchema.optional(),
    portfolio: importSchema.optional(),
    dividends: importSchema.optional(),
  }),
});

export type SbiImport = z.infer<typeof importSchema>;
export type SbiImports = Partial<Record<SbiKind, SbiImport>>;

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
  /** 넘긴 종류만 바꾸고 나머지는 그대로 둔다 */
  put(entries: SbiImports): Promise<SbiImports>;
  remove(kind: SbiKind): Promise<SbiImports>;
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
    const parsed = fileSchema.safeParse(json);
    if (!parsed.success) {
      throw new SbiImportFileError(
        filePath,
        "SBI CSV 저장 파일의 내용이 형식과 맞지 않습니다",
        parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
      );
    }
    return parsed.data.imports;
  }

  const write = (imports: SbiImports) => writeFileAtomic(filePath, `${JSON.stringify({ version: 1, imports }, null, 2)}\n`);

  return {
    load: () => serial(read),
    put: (entries) =>
      serial(async () => {
        const next = { ...(await read()), ...entries };
        await write(next);
        return next;
      }),
    remove: (kind) =>
      serial(async () => {
        const { [kind]: _removed, ...rest } = await read();
        await write(rest);
        return rest;
      }),
  };
}
