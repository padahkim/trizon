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
npm run typecheck    # 린터는 없다. 정적 검사는 tsc 뿐
npm test             # node --test "lib/**/*.test.ts" (네트워크 없음)
node --test lib/quotes/resolve.test.ts                          # 파일 하나만
node --test --test-name-pattern "KOSDAQ" "lib/**/*.test.ts"     # 테스트 이름으로 골라서
npm run quote:smoke -- 005930 7203 AAPL     # 실제 Yahoo 시세 확인 (네트워크)
npm run symbols:smoke -- 삼성전자 トヨタ      # 실제 종목 목록을 받아 검색 확인 (네트워크, data/ 는 건드리지 않음)
```

앱을 띄워 확인할 때는 `TRIZON_DATA_DIR=<임시 폴더> npm run dev`로 실제 자산 데이터(`data/`)와 분리한다.

## TypeScript 규칙

테스트는 빌드 없이 Node(>= 22.18)의 타입 스트리핑으로 `.ts`를 바로 실행한다. 그래서 다음을 지킨다.

- 상대 경로 import에 `.ts` 확장자를 붙인다 (`allowImportingTsExtensions`).
- 지워지는 문법만 쓴다 (`erasableSyntaxOnly`: enum·namespace·생성자 parameter property 금지). 타입만 가져올 때는 `import type`을 쓴다 (`verbatimModuleSyntax`).
- `lib/`는 Next 없이 돌아야 한다. `next`·`server-only`를 import하는 곳은 `lib/server.ts` 하나뿐이다.

## 아키텍처

코드 구조, 금액·통화 모델, 데이터 파일은 `architecture.md`에 정리한다. 코드를 고치기 전에 먼저 읽는다: @architecture.md

## 폴더별 지침

아래 폴더의 코드를 고치기 전에 그 폴더의 `AGENTS.md`를 먼저 읽는다.

- 시세·환율(Yahoo, Frankfurter), 종목 추가 시 심볼 확정: lib/quotes/AGENTS.md
- 종목명 검색 목록(한국투자증권 종목 마스터, JPX): lib/symbols/AGENTS.md
- 종목 자동완성 API `GET /api/symbols`: app/api/AGENTS.md
- SBI証券 CSV 가져오기(실현손익·포트폴리오·배당, 누적손익): lib/sbi/AGENTS.md

폴더별 지침은 그 폴더를 작업할 때만 읽히도록 여기서 `@`로 불러오지 않는다. 폴더별 지침을 새로 만들면 이 목록에 경로를 적는다.

- **Claude Code(v2.1.277+)·Antigravity:** 그 폴더의 파일을 열 때 폴더의 `AGENTS.md`를 자동으로 읽는다.
- **Codex:** 그 폴더에서 실행하지 않으면 자동으로 읽지 않으니 직접 연다.

## 지침 파일 관리

- 지침은 `AGENTS.md`(루트·폴더별)와 `architecture.md`에만 둔다. Claude Code는 `CLAUDE.md`가 없으면 `AGENTS.md`를 직접 읽는다.
- **`CLAUDE.md`나 `CLAUDE.local.md`를 만들지 않는다.** 이 폴더나 상위 폴더에 하나라도 있으면 Claude Code가 `AGENTS.md`를 읽지 않게 된다.
- `/init`도 `CLAUDE.md`를 만든다. 실행했다면 결과를 `AGENTS.md`로 옮기고 `CLAUDE.md`는 지운다.
