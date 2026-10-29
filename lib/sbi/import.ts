import { savedV1Schema, type SavedV1 } from "../portfolio/saved";
import { detectSbiKind } from "./detect";
import { parsePortfolio } from "./portfolio";
import { mergeTrades, parseUsTrades } from "./us-trades";

export type FileResult = { fileName: string; kind: "portfolio" | "usTrades" | null; error?: string; notices: string[] };

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function importSbiFiles(files: { name: string; bytes: Uint8Array }[], saved: SavedV1, now: Date): { saved: SavedV1; files: FileResult[] } {
  let next = saved;

  type PreDetected = {
    file: { name: string; bytes: Uint8Array };
    kind: FileResult["kind"];
    error?: string;
  };
  const preDetected: PreDetected[] = files.map((file) => {
    if (file.bytes.byteLength > MAX_FILE_SIZE) {
      return { file, kind: null, error: "5MB를 넘는 파일은 읽을 수 없습니다. 기간을 나눠 다시 받아 올려 주세요." };
    }
    try {
      const kind = detectSbiKind(file.bytes);
      if (!kind) {
        return { file, kind: null, error: "SBI증권의 ポートフォリオ·約定履歴 CSV인지 확인해 주세요." };
      }
      return { file, kind };
    } catch (error) {
      return { file, kind: null, error: error instanceof Error ? error.message : "파일을 읽지 못했습니다" };
    }
  });

  const portfolioCount = preDetected.filter((entry) => entry.kind === "portfolio").length;

  const results: FileResult[] = [];
  for (const entry of preDetected) {
    const { file, kind, error } = entry;
    if (error) {
      results.push({ fileName: file.name, kind, error, notices: [] });
      continue;
    }

    if (kind === "portfolio") {
      if (portfolioCount > 1) {
        results.push({
          fileName: file.name,
          kind: "portfolio",
          error: "ポートフォリオ CSV는 한 번에 하나만 올릴 수 있습니다. 하나만 골라 다시 올려 주세요.",
          notices: [],
        });
        continue;
      }
      try {
        const parsed = parsePortfolio(file.bytes, now);
        next = savedV1Schema.parse({
          ...next,
          sbiPortfolio: { uploadedAt: now.toISOString(), holdings: parsed.holdings, notices: parsed.notices },
        });
        results.push({ fileName: file.name, kind: "portfolio", notices: parsed.notices });
      } catch (err) {
        results.push({
          fileName: file.name,
          kind: "portfolio",
          error: err instanceof Error ? err.message : "파일을 읽지 못했습니다",
          notices: [],
        });
      }
    }
  }

  // Handle usTrades with kind-level atomicity: all or nothing
  const usTradeFiles = preDetected.filter((entry) => !entry.error && entry.kind === "usTrades");
  if (usTradeFiles.length > 0) {
    const parsedUsTrades = usTradeFiles.map((entry) => {
      try {
        return { file: entry.file, parsed: parseUsTrades(entry.file.bytes) };
      } catch (err) {
        return { file: entry.file, error: err instanceof Error ? err.message : "파일을 읽지 못했습니다" };
      }
    });

    const hasError = parsedUsTrades.some((entry) => entry.error);
    if (!hasError) {
      let trades = next.sbiUsTrades?.trades ?? [];
      for (const entry of parsedUsTrades) {
        trades = mergeTrades(trades, entry.parsed!.trades);
      }
      next = savedV1Schema.parse({
        ...next,
        sbiUsTrades: { uploadedAt: now.toISOString(), trades },
      });
    }

    for (const entry of parsedUsTrades) {
      if (entry.error) {
        results.push({ fileName: entry.file.name, kind: "usTrades", error: entry.error, notices: [] });
      } else if (hasError) {
        results.push({
          fileName: entry.file.name,
          kind: "usTrades",
          error: "함께 올린 約定履歴 파일에 오류가 있어 반영하지 않았습니다.",
          notices: entry.parsed!.notices,
        });
      } else {
        results.push({ fileName: entry.file.name, kind: "usTrades", notices: entry.parsed!.notices });
      }
    }
  }

  // Preserve original file order in results
  const fileOrder = new Map(files.map((file, index) => [file.name, index]));
  results.sort((a, b) => (fileOrder.get(a.fileName) ?? 0) - (fileOrder.get(b.fileName) ?? 0));

  return { saved: next, files: results };
}
