import { test } from "node:test";
import assert from "node:assert/strict";
import { codexStatus, gate, mergeTargets, problems, SKIP, unansweredThreads } from "./review-gate.ts";
import type { Lookup, Pr, Thread } from "./review-gate.ts";

const author = (login: string) => ({ login });

// PR #6·#7의 요약 코멘트 행 (2026-10-10 관측)
const summary = (...rows: string[]) => ({
  author: author("chatgpt-codex-connector"),
  body: [
    "<!-- codex-pull-request-review-summary -->",
    "",
    "## Codex Review Summary",
    "",
    "| Review | Status | Commit | Review trigger |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n"),
});
const row = (status: string, at: string | null, commit: string, kind = "📝 **Code Review**") =>
  `| ${kind} | ${status}${at ? ` <relative-time datetime="${at}">${at}</relative-time>` : ""} | \`${commit}\` | PR opened |`;
const COMPLETED = row("✅ **Completed**", "2026-10-10T14:59:13.445926Z", "3d4afe9");
const FAILED = row("⚠️ **Failed**", "2026-10-10T14:40:15.453078Z", "baa210f");

const pr = (over: Partial<Pr> = {}): Pr => ({
  number: 8,
  title: "t",
  url: "https://github.com/padahkim/trizon/pull/8",
  state: "OPEN",
  headRefName: "feat/x",
  headRefOid: "abc",
  author: author("padahkim"),
  comments: [summary(COMPLETED)],
  reviews: [],
  ...over,
});
const thread = (logins: string[], isResolved = false): Thread => ({
  isResolved,
  path: "scripts/agent-check.ts",
  line: 65,
  comments: { nodes: logins.map((login, i) => ({ author: author(login), url: `https://example.test/c${i}` })) },
});

test("mergeTargets: 번호·현재 브랜치·이어 붙인 명령", () => {
  assert.deepEqual(mergeTargets("gh pr merge 8 --merge"), [{ selector: "8" }]);
  assert.deepEqual(mergeTargets("gh pr merge --merge --delete-branch=false"), [{}]);
  assert.deepEqual(mergeTargets("git push && gh pr merge 9 --squash"), [{ selector: "9" }]);
  assert.deepEqual(mergeTargets("cd /tmp; GH_CONFIG_DIR=/x gh pr merge feat/x"), [{ selector: "feat/x" }]);
  assert.deepEqual(mergeTargets("gh pr merge https://github.com/padahkim/trizon/pull/7 -m"), [{ selector: "https://github.com/padahkim/trizon/pull/7" }]);
});

test("mergeTargets: 한 명령에 머지가 여럿이면 모두 찾는다", () => {
  assert.deepEqual(mergeTargets("gh pr merge 8 && gh pr merge 9"), [{ selector: "8" }, { selector: "9" }]);
  assert.deepEqual(mergeTargets("gh pr merge 8 --merge\ngh pr merge 9 --merge"), [{ selector: "8" }, { selector: "9" }]);
});

test("mergeTargets: 값을 받는 옵션의 값은 PR 지정으로 보지 않는다", () => {
  assert.deepEqual(mergeTargets('gh pr merge -t "merge 3" --body-file b.md 10'), [{ selector: "10" }]);
  assert.deepEqual(mergeTargets("gh pr merge --repo padahkim/trizon 3"), [{ selector: "3", repo: "padahkim/trizon" }]);
  assert.deepEqual(mergeTargets("gh pr merge 3 --repo=a/b"), [{ selector: "3", repo: "a/b" }]);
  assert.deepEqual(mergeTargets("gh pr merge 4 | tee log"), [{ selector: "4" }]);
});

test("mergeTargets: 서브커맨드 앞에 온 -R·--repo도 읽는다", () => {
  assert.deepEqual(mergeTargets("gh -R other/repo pr merge 3"), [{ selector: "3", repo: "other/repo" }]);
  assert.deepEqual(mergeTargets("gh pr -Rother/repo merge 3"), [{ selector: "3", repo: "other/repo" }]);
  assert.deepEqual(mergeTargets("gh pr --repo=other/repo merge 3 --merge"), [{ selector: "3", repo: "other/repo" }]);
  assert.deepEqual(mergeTargets("gh -R other/repo pr view 3"), []);
});

test("mergeTargets: 명령 위치가 아닌 gh pr merge와 다른 gh 명령은 무시", () => {
  assert.deepEqual(mergeTargets('git commit -m "gh pr merge 직전에 막는다"'), []);
  assert.deepEqual(mergeTargets('git commit -m "제목\ngh pr merge 8 이후"'), []);
  assert.deepEqual(mergeTargets("echo gh pr merge 8"), []);
  assert.deepEqual(mergeTargets("gh pr view 8"), []);
  assert.deepEqual(mergeTargets("gh pr merged 8"), []);
});

test("mergeTargets: 자동 머지 취소(--disable-auto)는 머지가 아니다", () => {
  assert.deepEqual(mergeTargets("gh pr merge 8 --disable-auto"), []);
  assert.deepEqual(mergeTargets("gh pr merge 8 --disable-auto && gh pr merge 9"), [{ selector: "9" }]);
  assert.equal(gate("gh pr merge 8 --disable-auto", lookup()), null);
});

test("codexStatus: 요약 코멘트의 완료·실패", () => {
  assert.deepEqual(codexStatus(pr()), { state: "completed", commit: "3d4afe9" });
  assert.deepEqual(codexStatus(pr({ comments: [summary(FAILED)] })), { state: "failed", commit: "baa210f" });
});

test("codexStatus: 시각 없는 행은 진행 중", () => {
  const s = codexStatus(pr({ comments: [summary(row("👀 **In progress**", null, "a1b2c3d"))] }));
  assert.deepEqual(s, { state: "running", label: "In progress" });
});

test("codexStatus: 같은 종류는 가장 최근 행만 본다 (실패 뒤 @codex review로 다시 받아 완료)", () => {
  const retried = row("✅ **Completed**", "2026-10-10T15:30:00Z", "baa210f");
  assert.deepEqual(codexStatus(pr({ comments: [summary(FAILED, retried)] })), { state: "completed", commit: "baa210f" });
  assert.deepEqual(codexStatus(pr({ comments: [summary(retried, FAILED)] })), { state: "completed", commit: "baa210f" });
});

test("codexStatus: 종류가 여럿이면 하나라도 실패면 실패", () => {
  const security = row("⚠️ **Failed**", "2026-10-10T15:00:00Z", "3d4afe9", "🔒 **Security Review**");
  assert.equal(codexStatus(pr({ comments: [summary(COMPLETED, security)] })).state, "failed");
});

test("codexStatus: 요약 코멘트가 없으면 Codex 리뷰 본문으로 판단 (PR #1~#5 형식)", () => {
  const review = { author: author("chatgpt-codex-connector"), body: "### 💡 Codex Review\n\n**Reviewed commit:** `33af5b1d21`" };
  assert.deepEqual(codexStatus(pr({ comments: [], reviews: [review] })), { state: "completed", commit: "33af5b1" });
  assert.deepEqual(codexStatus(pr({ comments: [], reviews: [] })), { state: "missing" });
});

test("unansweredThreads: 답글·resolve가 있으면 대응한 것으로 본다", () => {
  const bot = "chatgpt-codex-connector";
  const threads = [
    thread([bot]), // 미대응
    thread([bot, bot]), // 봇끼리만 → 미대응
    thread([bot, "padahkim"]), // 답글
    thread([bot], true), // resolve
    thread(["padahkim"]), // 작성자가 스스로 연 스레드
  ];
  assert.deepEqual(unansweredThreads(threads, "padahkim"), [threads[0], threads[1]]);
});

test("problems: 정리되면 비어 있고, 미대응 스레드·push 안 한 커밋은 막는다", () => {
  assert.deepEqual(problems(pr(), [thread(["chatgpt-codex-connector", "padahkim"])], 0), []);
  assert.deepEqual(problems(pr(), [], null), []);

  const found = problems(pr(), [thread(["chatgpt-codex-connector"])], 3);
  assert.equal(found.length, 2);
  assert.match(found[0], /스레드가 1개/);
  assert.match(found[0], /scripts\/agent-check\.ts:65/);
  assert.match(found[1], /feat\/x 브랜치에 PR에 없는 커밋이 3개/);
});

test("problems: Codex 리뷰가 없거나 실패하면 막는다", () => {
  assert.match(problems(pr({ comments: [] }), [], 0)[0], /아직 없다/);
  assert.match(problems(pr({ comments: [summary(FAILED)] }), [], 0)[0], /@codex review/);
});

/** 가짜 조회. 호출된 조회 이름을 calls에 남긴다 */
function lookup(over: Partial<Lookup> = {}, calls: string[] = []): Lookup {
  return {
    viewPr: (target) => (calls.push(`viewPr ${target.selector ?? ""}`), pr()),
    reviewThreads: () => (calls.push("reviewThreads"), [thread(["chatgpt-codex-connector"])]),
    unpushedCommits: () => (calls.push("unpushedCommits"), 0),
    localRepo: () => "padahkim/trizon",
    ...over,
  };
}

test("gate: 열린 PR에 미대응 스레드가 있으면 막고 이유를 돌려준다", () => {
  const message = gate("gh pr merge 8 --merge", lookup());
  assert.ok(message);
  assert.match(message, /PR #8의 리뷰가 정리되지 않아/);
  assert.match(message, /https:\/\/example\.test\/c0/);
  assert.match(message, new RegExp(SKIP));
});

test("gate: 한 명령의 머지 중 하나라도 정리되지 않았으면 막는다", () => {
  const calls: string[] = [];
  const mixed = lookup(
    {
      viewPr: (target) => (calls.push(`viewPr ${target.selector}`), pr({ number: Number(target.selector) })),
      reviewThreads: (p) => (p.number === 9 ? [thread(["chatgpt-codex-connector"])] : []),
    },
    calls,
  );
  const message = gate("gh pr merge 8 --merge && gh pr merge 9 --merge", mixed);
  assert.match(message ?? "", /PR #9의 리뷰가 정리되지 않아/);
  assert.doesNotMatch(message ?? "", /PR #8/);
  assert.deepEqual(calls.filter((c) => c.startsWith("viewPr")), ["viewPr 8", "viewPr 9"]);
});

test("gate: 정리된 PR, 이미 머지된 PR, 찾지 못한 PR은 통과", () => {
  assert.equal(gate("gh pr merge 8", lookup({ reviewThreads: () => [] })), null);
  assert.equal(gate("gh pr merge 8", lookup({ viewPr: () => pr({ state: "MERGED" }) })), null);
  const missing = lookup({
    viewPr: () => {
      throw new Error('gh pr view: no pull requests found for branch "development"');
    },
  });
  assert.equal(gate("gh pr merge", missing), null);
  const noNumber = lookup({
    viewPr: () => {
      throw new Error("gh pr view: GraphQL: Could not resolve to a PullRequest with the number of 9999. (repository.pullRequest)");
    },
  });
  assert.equal(gate("gh pr merge 9999", noNumber), null);
});

test("gate: PR이 없다는 답이 아닌 조회 실패는 막는다", () => {
  for (const reason of ["gh pr view: HTTP 401: Bad credentials", "gh pr view: API rate limit exceeded", 'gh pr view: Unknown JSON field: "headRefOid"']) {
    const broken = lookup({
      viewPr: () => {
        throw new Error(reason);
      },
    });
    assert.match(gate("gh pr merge 8", broken) ?? "", /PR 8을 조회하지 못해/, reason);
  }
});

test("gate: 머지가 아닌 명령과 건너뛰기는 조회하지 않고 통과", () => {
  const calls: string[] = [];
  assert.equal(gate("git status", lookup({}, calls)), null);
  assert.equal(gate(`${SKIP} gh pr merge 8`, lookup({}, calls)), null);
  assert.deepEqual(calls, []);
});

test("gate: 건너뛰기는 그 머지 명령에 환경변수로 붙였을 때만", () => {
  const calls: string[] = [];
  assert.match(gate(`echo '${SKIP}' && gh pr merge 8`, lookup({}, calls)) ?? "", /PR #8의 리뷰가 정리되지 않아/);
  assert.match(gate(`git commit -m "${SKIP}"; gh pr merge 8`, lookup()) ?? "", /PR #8/);

  calls.length = 0;
  const both = gate(`${SKIP} gh pr merge 8 && gh pr merge 9`, lookup({ viewPr: (target) => (calls.push(`viewPr ${target.selector}`), pr({ number: 9 })) }, calls));
  assert.deepEqual(calls.filter((c) => c.startsWith("viewPr")), ["viewPr 9"]);
  assert.match(both ?? "", /PR #9/);
});

test("gate: 리뷰를 읽지 못하면 막는다", () => {
  const broken = lookup({
    reviewThreads: () => {
      throw new Error("gh api graphql: HTTP 502");
    },
  });
  assert.match(gate("gh pr merge 8", broken) ?? "", /확인하지 못했다\(gh api graphql: HTTP 502\)/);
});

test("gate: --repo로 다른 리포를 가리키면 로컬 커밋은 비교하지 않는다", () => {
  const calls: string[] = [];
  const other = lookup({ viewPr: (target) => (calls.push(`viewPr ${target.selector}`), pr({ url: "https://github.com/other/repo/pull/3" })) }, calls);
  gate("gh pr merge 3 --repo other/repo", other);
  assert.deepEqual(calls, ["viewPr 3", "reviewThreads"]);
});

test("gate: --repo로 이 리포를 적었으면 로컬 커밋도 비교한다", () => {
  for (const repo of ["padahkim/trizon", "PadahKim/Trizon", "github.com/padahkim/trizon"]) {
    const calls: string[] = [];
    gate(`gh pr merge 8 --repo ${repo}`, lookup({ unpushedCommits: () => (calls.push("unpushedCommits"), 2) }, calls));
    assert.ok(calls.includes("unpushedCommits"), repo);
  }
  assert.match(gate("gh pr merge 8 -R padahkim/trizon", lookup({ reviewThreads: () => [], unpushedCommits: () => 2 })) ?? "", /PR에 없는 커밋이 2개/);
});
