import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { portfolioShiftJis, usTradesUtf8 } from "../lib/sbi/fixtures";

// Reuse the e2e fixtures; never copy real holdings into review data.
const directory = await mkdtemp(join(tmpdir(), "trizon-review-"));
const files = [
  ["portfolio.csv", portfolioShiftJis],
  ["us-trades.csv", usTradesUtf8],
] as const;

for (const [name, bytes] of files) {
  const path = join(directory, name);
  await writeFile(path, bytes, { flag: "wx" });
  console.log(path);
}
