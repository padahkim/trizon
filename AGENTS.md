<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# trizon

한국(KB·NH나무·토스)·일본(SBI証券) 계좌의 주식을 모아 총자산·수익률을 원/엔/달러로 보여 주는 **로컬 전용** Next.js 앱. DB·로그인·배포가 없고, 서버 컴포넌트와 Server Actions가 `data/`의 파일을 직접 읽고 쓴다. 보유종목은 사용자가 증권사 잔고 화면을 보고 직접 입력한다. SBI는 CSV를 끌어다 놓아 가져올 수도 있다(`/sbi`).

## 명령

```bash
npm run dev
npm run build
npm run check        # typecheck + test. 끝내기 전에 돌린다 (아래 "완료 전 검증")
npm run typecheck    # 린터는 없다. 정적 검사는 tsc 뿐
npm test             # node --test "lib/**/*.test.ts" "scripts/**/*.test.ts" (네트워크 없음)
node --test lib/quotes/resolve.test.ts                          # 파일 하나만
node --test --test-name-pattern "KOSDAQ" "lib/**/*.test.ts"     # 테스트 이름으로 골라서
npm run quote:smoke -- 005930 7203 AAPL     # 실제 Yahoo 시세 확인 (네트워크)
npm run symbols:smoke -- 삼성전자 トヨタ      # 실제 종목 목록을 받아 검색 확인 (네트워크, data/ 는 건드리지 않음)
npm run decision:next                       # 다음 결정 기록 번호와 겹친 번호 (작업 트리와 머지 전 로컬·원격 브랜치를 본다)
```

앱을 띄워 확인할 때는 `TRIZON_DATA_DIR=<임시 폴더> npm run dev`로 실제 자산 데이터(`data/`)와 분리한다.

## 완료 전 검증

코드(`.ts`·`.tsx`·`package.json`·`package-lock.json`·`tsconfig.json`)를 바꿨으면, 끝났다고 말하기 전에 `npm run check`를 통과시킨다(이유: docs/decisions/007-agent-stop-check.md).

- `app/`을 바꿨으면 `npm run build`도 돌린다. 서버·클라이언트 컴포넌트 경계 오류는 tsc가 잡지 못한다.
- Claude Code와 Codex는 Stop 훅(`scripts/agent-check.ts`)이 이를 확인한다. 실패하면 출력이 돌아오니 고친 뒤 다시 끝낸다. 실패 원인이 이번 작업과 무관하면 고치지 말고 사용자에게 알린다.
- 훅은 같은 턴에서 두 번째 실패부터는 막지 않는다. 그때는 실패한 채로 끝났다고 보고한다.
- Codex는 이 프로젝트의 `.codex/`를 trust해야 훅이 로드된다.

## TypeScript 규칙

테스트는 빌드 없이 Node(>= 22.18)의 타입 스트리핑으로 `.ts`를 바로 실행한다(이유: docs/decisions/005-node-test.md). 그래서 다음을 지킨다.

- 상대 경로 import에 `.ts` 확장자를 붙인다 (`allowImportingTsExtensions`).
- 지워지는 문법만 쓴다 (`erasableSyntaxOnly`: enum·namespace·생성자 parameter property 금지). 타입만 가져올 때는 `import type`을 쓴다 (`verbatimModuleSyntax`).
- `lib/`는 Next 없이 돌아야 한다. `next`·`server-only`를 import하는 곳은 `lib/server.ts` 하나뿐이다.

## 아키텍처

코드 구조, 금액·통화 모델, 데이터 파일은 `docs/architecture.md`에 정리한다. 코드를 고치기 전에 먼저 읽는다: @docs/architecture.md

## 폴더별 지침

아래 폴더의 코드를 고치기 전에 그 폴더의 `AGENTS.md`를 먼저 읽는다.

- 시세·환율(Yahoo, Frankfurter), 종목 추가 시 심볼 확정: lib/quotes/AGENTS.md
- 종목명 검색 목록(한국투자증권 종목 마스터, JPX): lib/symbols/AGENTS.md
- 종목 자동완성 API `GET /api/symbols`: app/api/AGENTS.md
- SBI証券 CSV 가져오기(실현손익·포트폴리오·배당, 누적손익): lib/sbi/AGENTS.md

폴더별 지침은 그 폴더를 작업할 때만 읽히도록 여기서 `@`로 불러오지 않는다. 폴더별 지침을 새로 만들면 이 목록에 경로를 적는다.

- **Claude Code(v2.1.277+)·Antigravity:** 그 폴더의 파일을 열 때 폴더의 `AGENTS.md`를 자동으로 읽는다.
- **Codex:** 그 폴더에서 실행하지 않으면 자동으로 읽지 않으니 직접 연다.

## 결정 기록

설계를 바꾸기 전이나 "왜 이렇게 했지?" 싶을 때는 아래에서 해당 기록을 찾아 먼저 읽는다. 필요할 때만 읽도록 `@`로 불러오지 않는다.

- 001 로컬 전용(DB·로그인·배포 없음): docs/decisions/001-local-only.md
- 002 보유종목은 직접 입력, SBI만 CSV, v2 후보는 한국 증권사 API: docs/decisions/002-manual-input.md
- 003 수익률은 증권사 화면 기준(계좌통화 평가): docs/decisions/003-broker-screen-returns.md
- 004 시세는 Yahoo 비공식 API, 환율은 Frankfurter로 대비: docs/decisions/004-yahoo-quotes.md
- 005 테스트는 프레임워크 없이 `node --test`: docs/decisions/005-node-test.md
- 006 지침·문서는 도구 중립 파일 한 벌(`AGENTS.md`, `docs/`): docs/decisions/006-agents-md.md
- 007 에이전트가 끝내기 전에 Stop 훅으로 `npm run check`: docs/decisions/007-agent-stop-check.md
- 009 다음에 또 쓸 자산은 리포에 자리를 잡아 두고, 두 번째 반복 때 만든다(Working Library): docs/decisions/009-working-library.md

## Working Library

다음에 또 쓸 자산(스킬·스크립트·틀)은 리포에 두고, 같은 작업을 두 번째로 손으로 할 때 만든다. 처음 하는 작업이면 만들지 않고 후보로만 적는다.

- 공유 스킬은 `.agents/skills/`에 있다. Codex·Antigravity는 여기서, Claude Code는 링크 `.claude/skills`로 읽는다.
- 자산별 자리, 만드는 때, 후보 목록, PR 회고 형식은 `docs/working-library.md`에 있다. 새 스킬·스크립트·틀을 만들기 전과 PR 본문을 쓰기 전에 먼저 읽는다.
- PR 본문 끝에는 "Working Library" 절(만든 것 / 다시 쓴 것 / 후보)을 쓴다.

## 지침 파일 관리

- 지침과 문서는 `AGENTS.md`(루트·폴더별)와 `docs/`에만, 반복 작업의 절차(스킬)는 `.agents/skills/`에만 둔다. `.claude/` 같은 도구 전용 폴더에는 두지 않는다. Codex·Antigravity가 읽지 않기 때문이다.
- 도구 전용 폴더(`.claude/settings.json`, `.codex/hooks.json`)에는 훅 설정만 두고, 실행할 로직은 `scripts/`에 둔다. 도구마다 같은 스크립트를 가리키게 한다. 예외는 `.agents/skills`를 가리키는 링크 `.claude/skills` 하나다.
- 내용에 따라 둘 곳을 정한다. 같은 내용을 두 곳에 쓰지 말고, 다른 문서의 내용이 필요하면 경로를 가리킨다.
  - 지금 어떻게 동작하나: `docs/architecture.md`(공통), 폴더별 `AGENTS.md`(외부 API·파일 형식)
  - 왜 그렇게 정했나, 무엇을 버렸나: `docs/decisions/`
  - 반복 작업을 어떤 순서로 하나: `.agents/skills/` (docs/working-library.md)
- 에이전트 메모리나 리포 밖 계획서에만 있는 결정은 리포로 옮긴다. 다른 PC나 다른 도구에서는 보이지 않는다.
- 결정 기록은 다음을 지킨다.
  - 쓸 때는 `new-decision` 스킬(`.agents/skills/new-decision/`)의 순서를 따른다.
  - 파일 이름은 `NNN-짧은-영문.md`다. 번호는 `npm run decision:next`로 받는다. 병렬 브랜치와 번호가 겹치면 나중에 머지하는 쪽이 번호를 바꾸고, 그 기록을 가리키는 곳도 같이 고친다.
  - 형식은 `.agents/skills/new-decision/template.md`를 따른다(상태·맥락·결정·버린 대안·감수하는 것·다시 볼 조건).
  - 채택한 기록의 내용은 고치지 않는다. 결정이 바뀌면 새 기록을 쓰고, 옛 기록과 위 목록에 `대체됨 → NNN`을 적는다. `-v2`·`-final` 같은 사본을 만들지 않는다.
  - 새로 만들면 위 "결정 기록" 목록에 한 줄을 추가한다. 번호 중복, 목록 누락, 없는 기록을 가리키는 경로는 `npm run check`가 잡는다.
  - public 리포라 금액·계좌번호 같은 실제 자산 정보는 쓰지 않는다.
- Claude Code는 `CLAUDE.md`가 없으면 `AGENTS.md`를 직접 읽는다.
- **`CLAUDE.md`나 `CLAUDE.local.md`를 만들지 않는다.** 이 폴더나 상위 폴더에 하나라도 있으면 Claude Code가 `AGENTS.md`를 읽지 않게 된다.
- `/init`도 `CLAUDE.md`를 만든다. 실행했다면 결과를 `AGENTS.md`로 옮기고 `CLAUDE.md`는 지운다.
