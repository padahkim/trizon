## Read before UI work

- Stack, folder layout, how to use shadcn: `docs/ARCHITECTURE.md` 「스택」「디렉토리 구조」
- Colors, fonts, spacing, component look: `DESIGN.md`
- How each screen behaves in each situation: `docs/PRD.md` 「상황별 동작」

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `padahkim/trizon`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: each of the five canonical triage roles uses its own name as the label string. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
