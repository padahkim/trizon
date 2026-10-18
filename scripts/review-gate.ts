// 머지 전 리뷰 게이트: `gh pr merge`가 실행되기 전에 PR 리뷰가 정리됐는지 확인하고, 아니면 exit 2로 막는다.
// Claude Code(.claude/settings.json)와 Codex(.codex/hooks.json)의 PreToolUse(Bash) 훅이 같이 쓴다. 이유: docs/decisions/008-review-gate.md
// 직접 확인: npm run review:status -- <PR 번호>   (번호를 빼면 현재 브랜치의 PR)

import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** 사용자가 이 상태로 머지하라고 했을 때만 명령 앞에 붙인다 */
export const SKIP = "TRIZON_SKIP_REVIEW_GATE=1";
/** Codex 봇이 PR마다 하나 달고 상태가 바뀔 때마다 고치는 요약 코멘트의 표식 */
const CODEX_SUMMARY = "<!-- codex-pull-request-review-summary -->";
const CODEX_BOT = "chatgpt-codex-connector";
/** `gh pr merge`에서 값을 받는 옵션. 바로 다음 토큰은 PR 지정이 아니다 */
const VALUE_FLAGS = new Set(["-A", "--author-email", "-b", "--body", "-F", "--body-file", "--match-head-commit", "-t", "--subject", "-R", "--repo"]);

type Author = { login: string } | null;

export type Pr = {
  number: number;
  title: string;
  url: string;
  state: string;
  headRefName: string;
  headRefOid: string;
  author: Author;
  comments: { author: Author; body: string }[];
  reviews: { author: Author; body: string }[];
};

export type Thread = {
  isResolved: boolean;
  path: string;
  line: number | null;
  comments: { nodes: { author: Author; url: string }[] };
};

export type MergeTarget = { selector?: string; repo?: string };

export type CodexStatus =
  | { state: "missing" }
  | { state: "running"; label: string }
  | { state: "failed" | "completed"; commit: string };

/** 따옴표만 처리해 단어로 나누고, 따옴표 밖의 셸 구분자(; & | 괄호 줄바꿈)마다 명령을 끊는다 */
function commands(text: string): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  let word = "";
  let started = false;
  let quote = "";
  const endWord = () => {
    if (started) current.push(word);
    word = "";
    started = false;
  };
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = "";
      else word += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      started = true;
    } else if (/[;&|()\n]/.test(ch)) {
      endWord();
      if (current.length > 0) out.push(current);
      current = [];
    } else if (/\s/.test(ch)) {
      endWord();
    } else {
      word += ch;
      started = true;
    }
  }
  endWord();
  if (current.length > 0) out.push(current);
  return out;
}

/** 한 명령의 단어들이 `gh pr merge`면 PR 지정(번호·URL·브랜치)과 `--repo`를 꺼낸다. 아니면 null */
function parseMerge(args: readonly string[]): MergeTarget | null {
  let i = 0;
  while (i < args.length && /^[A-Za-z_]\w*=/.test(args[i])) i++; // 앞에 붙은 환경변수 대입
  if (args[i] !== "gh" || args[i + 1] !== "pr" || args[i + 2] !== "merge") return null;
  const target: MergeTarget = {};
  for (i += 3; i < args.length; i++) {
    const arg = args[i];
    if (VALUE_FLAGS.has(arg)) {
      if (arg === "-R" || arg === "--repo") target.repo = args[i + 1];
      i++;
    } else if (arg.startsWith("--repo=")) {
      target.repo = arg.slice("--repo=".length);
    } else if (!arg.startsWith("-")) {
      target.selector ??= arg;
    }
  }
  return target;
}

/**
 * 명령 위치에 있는 `gh pr merge`를 모두 찾는다. 첫 단어가 gh인 명령만 보므로 문장이나 따옴표 속 "gh pr merge"에는 걸리지 않는다.
 * 하나만 보면 `gh pr merge 8 && gh pr merge 9`에서 9가 검사 없이 머지된다.
 */
export function mergeTargets(command: string): MergeTarget[] {
  return commands(command).flatMap((args) => {
    const target = parseMerge(args);
    return target ? [target] : [];
  });
}

/** Codex 요약 코멘트의 표에서 리뷰 종류마다 가장 최근 행을 골라 상태를 합친다 */
export function codexStatus(pr: Pick<Pr, "comments" | "reviews">): CodexStatus {
  const summary = pr.comments.findLast((c) => c.body.includes(CODEX_SUMMARY));
  if (!summary) {
    // 요약 코멘트가 생기기 전(2026-09, PR #1~#5)에는 리뷰만 달렸다
    const review = pr.reviews.findLast((r) => r.author?.login === CODEX_BOT);
    if (!review) return { state: "missing" };
    const commit = /Reviewed commit:\*\*\s*`([0-9a-f]+)`/.exec(review.body)?.[1].slice(0, 7) ?? "?";
    return { state: "completed", commit };
  }

  // 행: | 📝 **Code Review** | ✅ **Completed** <relative-time datetime="..."> | `3d4afe9` | PR opened |
  const latest = new Map<string, { at: number; status: string; commit: string }>();
  for (const line of summary.body.split("\n")) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const status = /\*\*(.+?)\*\*/.exec(cells[1] ?? "")?.[1];
    if (!status) continue; // 머리글·구분선
    // 시각이 없는 행은 아직 진행 중인 리뷰로 보고 가장 최근으로 친다
    const time = /datetime="([^"]+)"/.exec(cells[1])?.[1];
    const at = time ? Date.parse(time) : Infinity;
    const kind = cells[0];
    if ((latest.get(kind)?.at ?? -Infinity) <= at) latest.set(kind, { at, status, commit: (cells[2] ?? "").replaceAll("`", "") });
  }

  const rows = [...latest.values()];
  const running = rows.find((row) => row.status !== "Completed" && row.status !== "Failed");
  if (running || rows.length === 0) return { state: "running", label: running?.status ?? "표 없음" };
  const failed = rows.find((row) => row.status === "Failed");
  if (failed) return { state: "failed", commit: failed.commit };
  return { state: "completed", commit: rows[0].commit };
}

/** resolve되지 않았고, 처음 단 사람 말고는 아무도 답하지 않은 스레드. PR 작성자가 스스로 연 스레드는 뺀다 */
export function unansweredThreads(threads: Thread[], prAuthor: string | undefined): Thread[] {
  return threads.filter((thread) => {
    if (thread.isResolved) return false;
    const [opener, ...replies] = thread.comments.nodes.map((c) => c.author?.login);
    if (opener === prAuthor) return false;
    return !replies.some((login) => login !== opener);
  });
}

/** 머지를 막을 이유. 비어 있으면 머지해도 된다. unpushed는 로컬 PR 브랜치에만 있는 커밋 수(알 수 없으면 null) */
export function problems(pr: Pr, threads: Thread[], unpushed: number | null): string[] {
  const out: string[] = [];
  const codex = codexStatus(pr);
  if (codex.state === "missing") {
    out.push("Codex 리뷰가 아직 없다. PR을 연 직후라면 몇 분 뒤 다시 확인하고, 계속 없으면 사용자에게 묻는다.");
  } else if (codex.state === "running") {
    out.push(`Codex 리뷰가 아직 끝나지 않았다(${codex.label}). 끝난 뒤 다시 확인한다.`);
  } else if (codex.state === "failed") {
    out.push(`Codex 리뷰가 실패했다(${codex.commit}). PR에 \`@codex review\` 코멘트를 달아 다시 받을지 사용자에게 묻는다.`);
  }

  const open = unansweredThreads(threads, pr.author?.login);
  if (open.length > 0) {
    const lines = open.map((thread) => {
      const first = thread.comments.nodes[0];
      return `  - ${first?.author?.login ?? "?"} · ${thread.path}${thread.line ? `:${thread.line}` : ""} · ${first?.url ?? ""}`;
    });
    out.push(`답글도 resolve도 없는 리뷰 스레드가 ${open.length}개 있다.\n${lines.join("\n")}`);
  }

  if (unpushed) out.push(`로컬 ${pr.headRefName} 브랜치에 PR에 없는 커밋이 ${unpushed}개 있다. push한 뒤 머지한다.`);
  return out;
}

function run(cmd: string, args: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { ok: r.status === 0, out: r.stdout ?? "", err: (r.stderr || r.error?.message || "").trim() };
}

function gh(args: string[]): string {
  const r = run("gh", args);
  if (!r.ok) throw new Error(`gh ${args.slice(0, 2).join(" ")}: ${r.err}`);
  return r.out;
}

function viewPr(target: MergeTarget): Pr {
  const args = ["pr", "view", ...(target.selector ? [target.selector] : []), ...(target.repo ? ["--repo", target.repo] : [])];
  return JSON.parse(gh([...args, "--json", "number,title,url,state,headRefName,headRefOid,author,comments,reviews"]));
}

const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) { nodes { isResolved path line comments(first: 50) { nodes { author { login } url } } } }
    }
  }
}`;

function reviewThreads(pr: Pr): Thread[] {
  const [, owner, name] = new URL(pr.url).pathname.split("/");
  const out = gh(["api", "graphql", "-f", `query=${THREADS_QUERY}`, "-f", `owner=${owner}`, "-f", `name=${name}`, "-F", `number=${pr.number}`]);
  return JSON.parse(out).data.repository.pullRequest.reviewThreads.nodes;
}

/** 로컬 PR 브랜치에 있고 PR head에는 없는 커밋 수. 로컬 브랜치나 PR head 커밋이 없으면 알 수 없어 null */
function unpushedCommits(pr: Pr): number | null {
  if (!run("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${pr.headRefName}`]).ok) return null;
  if (!run("git", ["cat-file", "-e", `${pr.headRefOid}^{commit}`]).ok) return null;
  const r = run("git", ["rev-list", "--count", `${pr.headRefOid}..refs/heads/${pr.headRefName}`]);
  return r.ok ? Number(r.out.trim()) : null;
}

function readCommand(): string | undefined {
  try {
    const command = JSON.parse(readFileSync(0, "utf8") || "{}").tool_input?.command;
    return typeof command === "string" ? command : undefined;
  } catch {
    return undefined;
  }
}

/** GitHub·git 조회. 테스트에서는 가짜를 넣는다 */
export type Lookup = {
  viewPr: (target: MergeTarget) => Pr;
  reviewThreads: (pr: Pr) => Thread[];
  unpushedCommits: (pr: Pr) => number | null;
};

const github: Lookup = { viewPr, reviewThreads, unpushedCommits };

/** 훅의 판정. 명령 속 머지마다 확인해서, 하나라도 막아야 하면 에이전트에게 돌려줄 메시지, 모두 통과면 null */
export function gate(command: string, lookup: Lookup): string | null {
  if (command.includes(SKIP)) return null;
  const blocked = mergeTargets(command).flatMap((target) => {
    const message = checkMerge(target, lookup);
    return message ? [message] : [];
  });
  return blocked.length > 0 ? blocked.join("\n\n") : null;
}

/** 머지 하나의 판정. 막아야 하면 메시지, 통과면 null */
function checkMerge(target: MergeTarget, lookup: Lookup): string | null {
  let pr: Pr;
  try {
    pr = lookup.viewPr(target);
  } catch {
    return null; // PR을 찾지 못하면 통과시킨다. 진짜 머지 명령이면 gh가 같은 이유로 실패한다
  }
  if (pr.state !== "OPEN") return null;

  let found: string[];
  try {
    // --repo로 다른 리포를 가리키면 로컬 브랜치와 비교할 수 없다
    found = problems(pr, lookup.reviewThreads(pr), target.repo ? null : lookup.unpushedCommits(pr));
  } catch (e) {
    found = [`리뷰 상태를 확인하지 못했다(${(e as Error).message}). gh 인증·네트워크를 확인하고, 풀리지 않으면 사용자에게 알린다.`];
  }
  if (found.length === 0) return null;

  return (
    `PR #${pr.number}의 리뷰가 정리되지 않아 gh pr merge를 막았다. 아래를 처리한 뒤 다시 머지한다. 절차는 AGENTS.md의 "PR 리뷰와 머지"를 따른다.\n\n` +
    found.map((p) => `- ${p}`).join("\n") +
    `\n\n사용자가 이 상태로 머지하라고 명시했을 때만 명령 앞에 ${SKIP}을 붙여 다시 실행한다.`
  );
}

/** PreToolUse 훅. 막을 때만 exit 2이고, stderr가 에이전트에게 돌아간다 */
function hook(): number {
  const command = readCommand();
  const message = command === undefined ? null : gate(command, github);
  if (!message) return 0;
  console.error(message);
  return 2;
}

/** 사람·에이전트가 머지 전에 직접 돌려 보는 확인. 정리되지 않은 것이 있으면 exit 1 */
function cli(selector: string | undefined): number {
  const pr = viewPr({ selector });
  const threads = reviewThreads(pr);
  const found = problems(pr, threads, unpushedCommits(pr));
  const codex = codexStatus(pr);
  const codexLabel = codex.state === "missing" ? "없음" : codex.state === "running" ? codex.label : `${codex.state} (${codex.commit})`;

  console.log(`PR #${pr.number} ${pr.title} [${pr.state}]`);
  console.log(`Codex 리뷰: ${codexLabel} · 리뷰 스레드 ${threads.length}개 중 미대응 ${unansweredThreads(threads, pr.author?.login).length}개`);
  console.log(found.length === 0 ? "\n리뷰가 정리됐다." : `\n정리되지 않은 것:\n${found.map((p) => `- ${p}`).join("\n")}`);
  return found.length === 0 ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.chdir(fileURLToPath(new URL("..", import.meta.url)));
  try {
    process.exitCode = process.argv[2] === "--hook" ? hook() : cli(process.argv[2]);
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
