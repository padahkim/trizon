import { readFile } from "node:fs/promises";
import { portfolioFileSchema, type PortfolioFile } from "../domain/schema.ts";
import { createSerialQueue, isNotFound, writeFileAtomic } from "./fs-utils.ts";
import { PortfolioFileError, type PortfolioStore } from "./types.ts";

/**
 * data/portfolio.json 저장소.
 * - 파일이 없으면 seed 로 만든다.
 * - 파일이 깨져 있으면(JSON 오류·스키마 불일치) PortfolioFileError 를 던지고 파일은 건드리지 않는다.
 *   그 상태에서는 update 도 실패하므로 깨진 파일을 덮어쓰는 일이 없다.
 */
export function createJsonFileStore(filePath: string, seed: () => PortfolioFile): PortfolioStore {
  const serial = createSerialQueue();

  async function read(): Promise<PortfolioFile> {
    let text: string;
    try {
      text = await readFile(filePath, "utf8");
    } catch (err) {
      if (!isNotFound(err)) throw err;
      const initial = portfolioFileSchema.parse(seed());
      await writeFileAtomic(filePath, serialize(initial));
      return initial;
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new PortfolioFileError(filePath, "저장 파일의 JSON 형식이 깨져 있습니다", [String(err)]);
    }
    const parsed = portfolioFileSchema.safeParse(json);
    if (!parsed.success) {
      throw new PortfolioFileError(
        filePath,
        "저장 파일의 내용이 스키마와 맞지 않습니다",
        parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
      );
    }
    return parsed.data;
  }

  return {
    // 읽기도 같은 큐를 탄다 — 쓰는 중에 읽어서 seed 를 두 번 만드는 일을 막는다
    load: () => serial(read),
    update: (mutator) =>
      serial(async () => {
        const next = portfolioFileSchema.parse(mutator(await read()));
        await writeFileAtomic(filePath, serialize(next));
        return next;
      }),
  };
}

function serialize(file: PortfolioFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
