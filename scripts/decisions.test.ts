import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { decisionNumber, duplicates, listedDecisions, nextNumber, problems, readTree } from "./decisions.ts";
import type { Tree } from "./decisions.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const agentsMd = (...files: string[]) =>
  ["# trizon", "", "## 결정 기록", "", ...files.map((f) => `- 설명: docs/decisions/${f}`), "", "## 지침 파일 관리", "", "- 형식: docs/decisions/001-a.md"].join("\n");
const tree = (over: Partial<Tree> = {}): Tree => ({
  files: ["001-a.md", "002-b.md"],
  agentsMd: agentsMd("001-a.md", "002-b.md"),
  references: new Map(),
  ...over,
});

test("decisionNumber: NNN-짧은-영문.md 모양만", () => {
  assert.equal(decisionNumber("007-agent-stop-check.md"), 7);
  assert.equal(decisionNumber("7-agent.md"), null);
  assert.equal(decisionNumber("008-review-gate-v2.txt"), null);
  assert.equal(decisionNumber("README.md"), null);
});

test("nextNumber: 가장 큰 번호 다음. 기록이 없으면 001", () => {
  assert.equal(nextNumber(["001-a.md", "008-x.md", "008-y.md", "notes.md"]), 9);
  assert.equal(nextNumber([]), 1);
});

test("duplicates: 같은 번호의 서로 다른 파일만", () => {
  assert.deepEqual(duplicates(["008-y.md", "001-a.md", "008-x.md", "001-a.md"]), new Map([[8, ["008-x.md", "008-y.md"]]]));
  assert.equal(duplicates(["001-a.md", "002-b.md"]).size, 0);
});

test("listedDecisions: 결정 기록 절 안의 경로만 읽는다", () => {
  assert.deepEqual(listedDecisions(agentsMd("001-a.md", "002-b.md")), ["001-a.md", "002-b.md"]);
  assert.deepEqual(listedDecisions("# trizon\n\n## 결정 기록\n\n- 끝 절: docs/decisions/003-c.md\n"), ["003-c.md"]);
  assert.deepEqual(listedDecisions("# trizon\n"), []);
});

test("problems: 규칙에 맞으면 없음", () => {
  assert.deepEqual(problems(tree({ references: new Map([["scripts/x.ts", ["002-b.md"]]]) })), []);
});

test("problems: 병렬 브랜치가 같은 번호를 골랐다", () => {
  const found = problems(tree({ files: ["001-a.md", "002-b.md", "002-c.md"], agentsMd: agentsMd("001-a.md", "002-b.md", "002-c.md") }));
  assert.equal(found.length, 1);
  assert.match(found[0], /번호가 겹친다\(002\): 002-b\.md, 002-c\.md/);
});

test("problems: 목록 누락, 없는 기록을 가리킴, 이름 모양", () => {
  const found = problems(
    tree({
      files: ["001-a.md", "002-b.md", "3-c.md"],
      agentsMd: agentsMd("001-a.md"),
      references: new Map([["docs/golden-rules.md", ["008-old.md"]]]),
    }),
  );
  assert.deepEqual(found, [
    "docs/decisions/3-c.md: 파일 이름이 NNN-짧은-영문.md 모양이 아니다",
    'AGENTS.md "결정 기록" 목록에 없다: 002-b.md',
    'AGENTS.md "결정 기록" 목록에 없다: 3-c.md',
    "docs/golden-rules.md: 없는 결정 기록을 가리킨다: docs/decisions/008-old.md",
  ]);
});

// 리포의 실제 결정 기록. 실패하면 위 메시지대로 고친다(규칙: 루트 AGENTS.md "지침 파일 관리")
test("리포: 결정 기록 번호·목록·참조가 맞다", () => {
  assert.deepEqual(problems(readTree(ROOT)), []);
});
