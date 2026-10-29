/** SBI exports UTF-8 or CP932; fatal decoding prevents silent mojibake. */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    try {
      return new TextDecoder("shift_jis", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    } catch {
      throw new Error("인코딩을 인식하지 못했습니다 (UTF-8·Shift_JIS가 아닙니다). SBI증권에서 받은 CSV 원본 파일인지 확인해 주세요.");
    }
  }
}

export type CsvRow = { cells: string[]; line: number };

export function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let startLine = 1;
  const endCell = () => {
    cells.push(cell.normalize("NFKC").trim());
    cell = "";
  };
  const endRow = () => {
    endCell();
    while (cells.at(-1) === "") cells.pop();
    rows.push({ cells, line: startLine });
    cells = [];
  };
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || cell.trim() === "") quoted = !quoted;
      else cell += char;
    } else if (char === "," && !quoted) {
      endCell();
    } else if ((char === "\r" || char === "\n") && !quoted) {
      endRow();
      if (char === "\r" && source[i + 1] === "\n") i++;
      line++;
      startLine = line;
    } else {
      cell += char;
      if (char === "\n") line++;
    }
  }
  if (quoted) throw new Error(`${startLine}행: 따옴표가 닫히지 않았습니다`);
  if (cell || cells.length) endRow();
  return rows;
}

export function findColumn(header: string[], name: string): number {
  const exact = header.indexOf(name);
  return exact >= 0 ? exact : header.findIndex((cell) => cell.startsWith(`${name}(`));
}

export function parseAmount(value: string, line: number): { amount: number; currency?: string } | null {
  const normalized = value.normalize("NFKC").replace(/[\s,円]/g, "");
  if (["", "-", "--"].includes(normalized)) return null;
  const match = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([A-Z]{3})?$/);
  if (!match || !Number.isFinite(Number(match[1]))) {
    throw new Error(`${line}행: 숫자를 읽지 못했습니다`);
  }
  return { amount: Number(match[1]), ...(match[2] ? { currency: match[2] } : {}) };
}
