import { savedV1Schema, type SavedV1 } from "../portfolio/saved";
import { detectSbiKind } from "./detect";
import { parsePortfolio } from "./portfolio";
import { mergeTrades, parseUsTrades } from "./us-trades";

export type FileResult = { fileName: string; kind: "portfolio" | "usTrades" | null; error?: string; notices: string[] };

export function importSbiFiles(files: { name: string; bytes: Uint8Array }[], saved: SavedV1, now: Date): { saved: SavedV1; files: FileResult[] } {
  let next = saved;
  const results: FileResult[] = [];
  for (const file of files) {
    let kind: FileResult["kind"] = null;
    try {
      kind = detectSbiKind(file.bytes);
      let notices: string[] = [];
      if (kind === "portfolio") {
        const holdings = parsePortfolio(file.bytes, now);
        next = savedV1Schema.parse({ ...next, sbiPortfolio: { uploadedAt: now.toISOString(), holdings, notices } });
      } else if (kind === "usTrades") {
        const parsed = parseUsTrades(file.bytes);
        notices = parsed.notices;
        const trades = mergeTrades(next.sbiUsTrades?.trades ?? [], parsed.trades);
        next = savedV1Schema.parse({ ...next, sbiUsTrades: { uploadedAt: now.toISOString(), trades } });
      } else {
        throw new Error("SBI증권의 ポートフォリオ·約定履歴 CSV인지 확인해 주세요.");
      }
      results.push({ fileName: file.name, kind, notices });
    } catch (error) {
      results.push({ fileName: file.name, kind, error: error instanceof Error ? error.message : "파일을 읽지 못했습니다", notices: [] });
    }
  }
  return { saved: next, files: results };
}
