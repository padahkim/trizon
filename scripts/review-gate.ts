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
/** gh가 "그런 PR이 없다"고 답할 때의 문구 (2026-10-18 gh 2.x 관측). 이것만 통과시키고 다른 조회 실패는 막는다 */
const NO_PR = /no pull requests found|Could not resolve to a PullRequest/i;
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

/** skip: 그 머지 명령 앞에 SKIP을 환경변수로 붙였다 */
export type MergeTarget = { selector?: string; repo?: string; skip?: boolean };

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

/**
 * 한 명령의 단어들이 `gh pr merge`면 PR 지정(번호·URL·브랜치)과 `--repo`를 꺼낸다. 아니면 null.
 * `-R`은 상위 명령에서 물려받는 옵션이라 `gh -R a/b pr merge 3`, `gh pr -Ra/b merge 3`처럼 서브커맨드 앞에도 온다.
 */
function parseMerge(args: readonly string[]): MergeTarget | null {
  let i = 0;
  let skip = false;
  // 앞에 붙은 환경변수 대입. 건너뛰기는 이 머지 명령에 붙은 것만 인정한다(echo 속 문자열 등은 무시)
  for (; i < args.length && /^[A-Za-z_]\w*=/.test(args[i]); i++) if (args[i] === SKIP) skip = true;
  if (args[i] !== "gh") return null;
  const target: MergeTarget = skip ? { skip } : {};
  const positional: string[] = [];
  for (i++; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-R" || arg === "--repo") target.repo = args[++i];
    else if (arg.startsWith("--repo=")) target.repo = arg.slice("--repo=".length);
    else if (/^-R./.test(arg)) target.repo = arg.slice(2);
    else if (VALUE_FLAGS.has(arg)) i++;
    else if (!arg.startsWith("-")) positional.push(arg);
  }
  if (positional[0] !== "pr" || positional[1] !== "merge") return null;
  // 자동 머지 취소는 머지가 아니다. 리뷰가 덜 됐을 때야말로 취소해야 하므로 막지 않는다
  if (args.includes("--disable-auto")) return null;
  if (positional[2] !== undefined) target.selector = positional[2];
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
  // public 리포라 누구나 표식이 든 코멘트를 달 수 있다. 봇이 단 것만 믿는다
  const summary = pr.comments.findLast((c) => c.author?.login === CODEX_BOT && c.body.includes(CODEX_SUMMARY));
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

/**
 * resolve되지 않았고 PR 작성자가 답하지 않은 스레드. PR 작성자가 스스로 연 스레드는 뺀다.
 * 다른 리뷰어나 봇의 "+1"은 대응이 아니므로 작성자의 답글만 본다.
 */
export function unansweredThreads(threads: Thread[], prAuthor: string | undefined): Thread[] {
  return threads.filter((thread) => {
    if (thread.isResolved) return false;
    const [opener, ...replies] = thread.comments.nodes.map((c) => c.author?.login);
    if (opener === prAuthor) return false;
    return prAuthor === undefined || !replies.includes(prAuthor);
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
    out.push(`PR 작성자의 답글도 resolve도 없는 리뷰 스레드가 ${open.length}개 있다.\n${lines.join("\n")}`);
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

/** 이 체크아웃의 origin 리포("owner/name", 소문자). github-personal:owner/name.git·https URL 모두 받는다. 알 수 없으면 null */
function localRepo(): string | null {
  const r = run("git", ["remote", "get-url", "origin"]);
  if (!r.ok) return null;
  const parts = r.out.trim().replace(/\.git$/, "").split(/[/:]/);
  return parts.length >= 2 ? parts.slice(-2).join("/").toLowerCase() : null;
}

/** PR URL(https://github.com/owner/name/pull/N)의 "owner/name", 소문자 */
export function repoOf(url: string): string {
  return new URL(url).pathname.split("/").slice(1, 3).join("/").toLowerCase();
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
  localRepo: () => string | null;
};

const github: Lookup = { viewPr, reviewThreads, unpushedCommits, localRepo };

/** 훅의 판정. 명령 속 머지마다 확인해서, 하나라도 막아야 하면 에이전트에게 돌려줄 메시지, 모두 통과면 null */
export function gate(command: string, lookup: Lookup): string | null {
  const blocked = mergeTargets(command).flatMap((target) => {
    if (target.skip) return [];
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
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // PR이 없다고 확인된 경우만 통과시킨다(번호 오타, PR이 없는 브랜치). 진짜 머지 명령이면 gh도 같은 이유로 실패한다.
    // 인증·rate limit·일시 오류는 머지 요청만 성공할 수 있으므로 막는다
    if (NO_PR.test(message)) return null;
    return `PR ${target.selector ?? "(현재 브랜치)"}을 조회하지 못해 gh pr merge를 막았다(${message}). gh 인증·네트워크를 확인하고, 풀리지 않으면 사용자에게 알린다.`;
  }
  if (pr.state !== "OPEN") return null;

  let found: string[];
  try {
    // --repo로 다른 리포를 가리키면 로컬 브랜치와 비교할 수 없다. 이 리포를 --repo로 적었으면 비교한다
    const local = !target.repo || repoOf(pr.url) === lookup.localRepo();
    found = problems(pr, lookup.reviewThreads(pr), local ? lookup.unpushedCommits(pr) : null);
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
