// 공유 스킬의 자리 검사: .agents/skills/ 가 원본이고 .claude/skills 는 그 링크다. 규칙: docs/working-library.md "스킬"

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKILLS = join(ROOT, ".agents/skills");

test("Claude Code용 .claude/skills가 .agents/skills를 가리킨다", () => {
  assert.equal(realpathSync(join(ROOT, ".claude/skills")), realpathSync(SKILLS));
});

for (const name of readdirSync(SKILLS)) {
  test(`스킬 ${name}: frontmatter는 폴더 이름과 같은 name과 description만`, () => {
    const text = readFileSync(join(SKILLS, name, "SKILL.md"), "utf8");
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
    assert.ok(frontmatter, "SKILL.md가 --- frontmatter로 시작해야 한다");
    const fields = new Map([...frontmatter.matchAll(/^([\w-]+):\s*(.*)$/gm)].map((m) => [m[1], m[2].trim()]));
    assert.deepEqual([...fields.keys()].sort(), ["description", "name"]);
    assert.equal(fields.get("name"), name);
    assert.ok(fields.get("description"), "description에 언제 쓰는지 적는다");
  });
}
