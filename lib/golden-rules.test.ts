import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// docs/golden-rules.md 의 규칙 가운데 기계로 확인할 수 있는 것을 검사한다. npm run check(= 에이전트 Stop 훅)가 돌린다.
// 소스 문자열을 보는 검사라 주석 속 문자열에도 걸린다. 오탐이면 규칙 문서와 이 파일을 같이 고친다.

const ROOT = join(import.meta.dirname, "..");

type Source = { path: string; text: string };

/** dir 아래 파일들 (경로는 리포 기준 "/" 구분) */
function files(dir: string, pattern: RegExp): Source[] {
  return (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
    .map((name) => `${dir}/${name.replaceAll("\\", "/")}`)
    .filter((path) => pattern.test(path))
    .map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }));
}

const lib = files("lib", /\.ts$/).filter((f) => !f.path.endsWith(".test.ts"));
const app = files("app", /\.tsx?$/);

/**
 * 아직 고치지 못한 표시 포맷. docs/golden-rules.md 5절의 "날짜·시각 표시 다섯 벌"과 "평균 매입환율 표시 세 벌"이다.
 * 고쳤으면 여기서 지운다. 목록은 줄기만 한다.
 */
const FORMAT_EXCEPTIONS = [
  "app/holdings/HoldingForm.tsx",
  "app/holdings/page.tsx",
  "app/page.tsx",
  "app/sbi/page.tsx",
  "lib/store/snapshots.ts",
];

test("표시 포맷(toLocaleString·Intl)은 lib/format/ 에만 둔다", () => {
  const offenders = [...lib, ...app]
    .filter((f) => !f.path.startsWith("lib/format/") && /\.toLocale\w*String\(|\bIntl\./.test(f.text))
    .map((f) => f.path);
  assert.deepEqual(
    offenders.filter((path) => !FORMAT_EXCEPTIONS.includes(path)),
    [],
    "새 표시 형식은 lib/format/ 에 함수를 더해 쓴다",
  );
  assert.deepEqual(
    FORMAT_EXCEPTIONS.filter((path) => !offenders.includes(path)),
    [],
    "고친 파일은 FORMAT_EXCEPTIONS 와 docs/golden-rules.md 5절에서 지운다",
  );
});

test("lib/ 에서 next·server-only 를 import 하는 곳은 lib/server.ts 하나뿐이다", () => {
  const offenders = lib
    .filter((f) => f.path !== "lib/server.ts" && /(?:from|import)\s+["'](?:next(?:\/[^"']*)?|server-only)["']/.test(f.text))
    .map((f) => f.path);
  assert.deepEqual(offenders, [], "lib/ 는 Next 없이 돌아야 한다 (루트 AGENTS.md \"TypeScript 규칙\")");
});

test("lib/ 는 로그를 찍지 않는다", () => {
  const offenders = lib.filter((f) => /\bconsole\./.test(f.text)).map((f) => f.path);
  assert.deepEqual(offenders, [], "사용자가 알아야 할 문제는 결과의 warnings 로 돌려준다");
});

test("app/ 의 로그는 JSON line 이다", () => {
  const offenders = app
    .filter((f) => (f.text.match(/\bconsole\.\w+\(/g) ?? []).length !== (f.text.match(/\bconsole\.\w+\(\s*JSON\.stringify\(/g) ?? []).length)
    .map((f) => f.path);
  assert.deepEqual(offenders, [], 'console.error(JSON.stringify({ ts, event, ... })) 로 쓴다');
});

test("Claude Code·Gemini 전용 지침 파일을 만들지 않는다", () => {
  const found = ["CLAUDE.md", "CLAUDE.local.md", "GEMINI.md"].filter((name) => existsSync(join(ROOT, name)));
  assert.deepEqual(found, [], "있으면 Claude Code 가 AGENTS.md 를 읽지 않는다 (docs/decisions/006-agents-md.md)");
});

test("docs/ 문서와 폴더별 AGENTS.md 는 모두 루트 AGENTS.md 에서 가리킨다", () => {
  const index = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
  const docs = files("docs", /\.md$/).map((f) => f.path);
  const folderGuides = [...files("lib", /\/AGENTS\.md$/), ...files("app", /\/AGENTS\.md$/)].map((f) => f.path);
  assert.deepEqual(
    [...docs, ...folderGuides].filter((path) => !index.includes(path)),
    [],
    '루트 AGENTS.md 의 "결정 기록"·"폴더별 지침" 목록에 경로를 적는다',
  );
});
