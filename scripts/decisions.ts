// 결정 기록(docs/decisions/NNN-*.md) 도우미: 작업 트리와 아직 머지하지 않은 로컬·원격 브랜치를 보고 다음 번호와 겹친 번호를 알려 준다.
// new-decision 스킬(.agents/skills/new-decision)이 쓰고, 트리 검사(problems)는 scripts/decisions.test.ts가 `npm test`에서 돌린다. 이유: docs/decisions/009-working-library.md
// 직접 확인: npm run decision:next   (원격 브랜치는 마지막 git fetch 기준)

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DECISIONS_DIR = "docs/decisions";
const FILE = /^(\d{3})-[a-z0-9-]+\.md$/;
const REFERENCE = /docs\/decisions\/(\d{3}-[a-z0-9-]+\.md)/g;
/** 결정 기록을 가리키는 문서·코드가 있는 곳. 테스트 파일의 가짜 경로는 보지 않는다 */
const REFERENCE_ROOTS = ["AGENTS.md", "README.md", "docs", "app", "lib", "scripts", ".agents"];
const REFERENCE_FILE = /(?<!\.test)\.(md|ts|tsx)$/;

/** `NNN-짧은-영문.md` 모양이면 번호, 아니면 null */
export function decisionNumber(file: string): number | null {
  const m = FILE.exec(file);
  return m ? Number(m[1]) : null;
}

export function nextNumber(files: Iterable<string>): number {
  let max = 0;
  for (const file of files) max = Math.max(max, decisionNumber(file) ?? 0);
  return max + 1;
}

/** 같은 번호를 쓰는 서로 다른 파일. 번호 → 파일 이름(정렬) */
export function duplicates(files: Iterable<string>): Map<number, string[]> {
  const byNumber = new Map<number, Set<string>>();
  for (const file of files) {
    const n = decisionNumber(file);
    if (n === null) continue;
    byNumber.set(n, (byNumber.get(n) ?? new Set()).add(file));
  }
  const out = new Map<number, string[]>();
  for (const [n, set] of [...byNumber].sort(([a], [b]) => a - b)) {
    if (set.size > 1) out.set(n, [...set].sort());
  }
  return out;
}

/** 루트 AGENTS.md의 "결정 기록" 절에 적힌 파일 이름 */
export function listedDecisions(agentsMd: string): string[] {
  const section = /^## 결정 기록\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(agentsMd)?.[1] ?? "";
  return [...section.matchAll(REFERENCE)].map((m) => m[1]);
}

export type Tree = {
  /** docs/decisions/ 안의 파일 이름 */
  files: string[];
  agentsMd: string;
  /** 결정 기록을 가리키는 파일 경로 → 가리키는 결정 기록 파일 이름 */
  references: Map<string, string[]>;
};

/** 작업 트리의 결정 기록이 규칙(루트 AGENTS.md "지침 파일 관리")에 맞는지. 문제마다 한 줄 */
export function problems(tree: Tree): string[] {
  const out: string[] = [];
  const files = new Set(tree.files);
  for (const file of tree.files) {
    if (decisionNumber(file) === null) out.push(`${DECISIONS_DIR}/${file}: 파일 이름이 NNN-짧은-영문.md 모양이 아니다`);
  }
  for (const [n, names] of duplicates(tree.files)) {
    out.push(`번호가 겹친다(${String(n).padStart(3, "0")}): ${names.join(", ")}. 나중에 머지하는 쪽이 번호를 바꾸고, 가리키는 곳도 같이 고친다`);
  }
  const listed = new Set(listedDecisions(tree.agentsMd));
  for (const file of files) {
    if (!listed.has(file)) out.push(`AGENTS.md "결정 기록" 목록에 없다: ${file}`);
  }
  for (const [path, names] of tree.references) {
    for (const name of names) {
      if (!files.has(name)) out.push(`${path}: 없는 결정 기록을 가리킨다: docs/decisions/${name}`);
    }
  }
  return out;
}

function referencesUnder(root: string, path: string, out: Map<string, string[]>): void {
  let entries: string[];
  try {
    entries = readdirSync(join(root, path), { recursive: true, encoding: "utf8" }).map((p) => join(path, p));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    if ((e as NodeJS.ErrnoException).code !== "ENOTDIR") throw e;
    entries = [path];
  }
  for (const file of entries) {
    if (!REFERENCE_FILE.test(file)) continue;
    const names = [...readFileSync(join(root, file), "utf8").matchAll(REFERENCE)].map((m) => m[1]);
    if (names.length > 0) out.set(file, names);
  }
}

export function readTree(root: string): Tree {
  const references = new Map<string, string[]>();
  for (const path of REFERENCE_ROOTS) referencesUnder(root, path, references);
  return {
    files: readdirSync(join(root, DECISIONS_DIR)).filter((f) => f.endsWith(".md")),
    agentsMd: readFileSync(join(root, "AGENTS.md"), "utf8"),
    references,
  };
}

function git(...args: string[]): string {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

/** 결정 기록 파일 이름 → 그 파일이 있는 곳(작업 트리, 브랜치 이름).
 * HEAD에 이미 머지된 브랜치는 보지 않는다. 머지 뒤에 번호를 바꾼 기록의 옛 이름이 남아 있어 중복으로 잘못 잡히기 때문이다 */
function decisionsEverywhere(): Map<string, string[]> {
  const where = new Map<string, string[]>();
  const add = (file: string, place: string) => where.set(file, [...(where.get(file) ?? []), place]);
  for (const file of readdirSync(DECISIONS_DIR)) add(file, "작업 트리");
  for (const line of git("for-each-ref", "--no-merged=HEAD", "--format=%(refname:short)%09%(symref)", "refs/heads", "refs/remotes").split("\n")) {
    const [ref, symref] = line.split("\t");
    if (!ref || symref) continue; // origin/HEAD 같은 별칭은 건너뛴다
    for (const path of git("ls-tree", "--name-only", ref, `${DECISIONS_DIR}/`).split("\n").filter(Boolean)) {
      add(path.slice(DECISIONS_DIR.length + 1), ref);
    }
  }
  return where;
}

function cli(): number {
  const where = decisionsEverywhere();
  const files = [...where.keys()].filter((f) => decisionNumber(f) !== null).sort();
  console.log(`다음 번호: ${String(nextNumber(files)).padStart(3, "0")}`);

  const elsewhere = files.filter((f) => !where.get(f)?.includes("작업 트리"));
  if (elsewhere.length > 0) {
    console.log("\n작업 트리에 없는 기록 (다른 브랜치에서 진행 중):");
    for (const f of elsewhere) console.log(`  ${f}  ${where.get(f)?.join(", ")}`);
  }

  const dup = duplicates(files);
  if (dup.size > 0) {
    console.log("\n번호 중복:");
    for (const [n, names] of dup) console.log(`  ${String(n).padStart(3, "0")}: ${names.join(", ")}`);
    console.log("  나중에 머지하는 쪽이 번호를 바꾼다. 사용자에게 알린다.");
  }
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.chdir(fileURLToPath(new URL("..", import.meta.url)));
  try {
    process.exitCode = cli();
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
