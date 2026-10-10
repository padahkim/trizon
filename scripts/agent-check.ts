// 에이전트 Stop 훅: 코드가 바뀌었으면 `npm run check`를 돌리고, 실패하면 exit 2로 출력을 에이전트에게 돌려준다.
// Claude Code(.claude/settings.json)와 Codex(.codex/hooks.json)가 같이 쓴다. 이유: docs/decisions/007-agent-stop-check.md
// 수동 확인: echo '{}' | node scripts/agent-check.ts; echo $?

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** 검사 결과에 영향을 주는 파일 (git pathspec) */
const CODE = ["*.ts", "*.tsx", "package.json", "package-lock.json", "tsconfig.json"];
const TAIL_LINES = 80;

type State = { fingerprint: string; ok: boolean };

function git(...args: string[]): string {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

/** 작업 트리의 코드 상태 지문. 커밋해도, 문서만 바꿔도 그대로다 */
function fingerprint(): string {
  const hash = createHash("sha256");
  hash.update(git("ls-files", "-s", "--", ...CODE));
  hash.update(git("diff", "--binary", "--", ...CODE));
  for (const file of git("ls-files", "--others", "--exclude-standard", "--", ...CODE).split("\n").filter(Boolean)) {
    hash.update(file).update(readFileSync(file));
  }
  return hash.digest("hex");
}

function readInput(): { stop_hook_active?: boolean } {
  if (process.stdin.isTTY) return {};
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function main(): number {
  process.chdir(fileURLToPath(new URL("..", import.meta.url)));
  const input = readInput();
  const statePath = git("rev-parse", "--git-path", "agent-check-state").trim();
  const current = fingerprint();

  // 같은 코드 상태는 한 번만 판정한다. 질문만 한 턴이나 이미 알린 실패로 매번 막지 않기 위해서다
  let last: State | null = null;
  try {
    last = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {}
  if (last?.fingerprint === current) return 0;

  const r = spawnSync("npm run check 2>&1", { shell: true, encoding: "utf8" });
  const ok = r.status === 0;
  writeFileSync(statePath, JSON.stringify({ fingerprint: current, ok } satisfies State));
  if (ok) return 0;

  const tail = r.stdout.trimEnd().split("\n").slice(-TAIL_LINES).join("\n");
  if (input.stop_hook_active) {
    // 한 번 돌려보냈는데도 실패하면 더 막지 않고 사람에게 넘긴다 (무한 루프 방지)
    console.error(`npm run check가 아직 실패한다. 실패한 채로 끝났다고 사용자에게 보고한다.\n\n${tail}`);
    return 0;
  }
  console.error(
    `npm run check가 실패했다. 아래 출력을 보고 고친 뒤 다시 끝낸다. ` +
      `실패 원인이 이번 작업과 무관하면 고치지 말고 사용자에게 알린다.\n\n${tail}`,
  );
  return 2;
}

process.exitCode = main();
