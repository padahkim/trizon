# 007. 에이전트가 끝내기 전에 Stop 훅으로 `npm run check`를 돌린다

- 상태: 채택 (2026-10-10)
- 관련: 006(도구 중립 지침), 동작은 루트 `AGENTS.md`의 "완료 전 검증"과 `scripts/agent-check.ts`

## 맥락

- 에이전트가 "끝났다"고 말해도, 그 판단은 같은 모델이 내린 자기 평가다. 믿을 수 있는 신호는 모델 밖의 결정론적 검사에서 와야 한다.
- 이 리포에는 그런 검사가 이미 있다. `tsc`(약 1초)와 네트워크 없는 `node --test`(약 1초)다. 그런데 `AGENTS.md`에는 명령 목록만 있어서, 에이전트가 끝내기 전에 실제로 돌렸는지는 아무것도 확인하지 않았다.
- Claude Code(회사 PC)와 Codex(집 PC)를 같이 쓴다. 두 도구 모두 Stop 훅이 있고, 형식과 실패 신호(exit 2 + stderr, `stop_hook_active`)가 같다. Codex는 v0.124(2026-04)에서 훅이 stable이 됐다.

## 결정

- 검사는 `npm run check`(typecheck + test) 하나로 정한다. 사람도 에이전트도 같은 명령을 쓴다.
- 훅 로직은 도구 중립인 `scripts/agent-check.ts` 하나에 둔다. `.claude/settings.json`과 `.codex/hooks.json`은 이 스크립트를 가리키기만 한다.
- 훅은 이렇게 동작한다.
  1. 코드 파일의 상태가 마지막 판정 때와 같으면 그냥 끝낸다. 질문만 한 턴이나 이미 알린 실패로 매번 막지 않기 위해서다. 지문은 `.git/agent-check-state`에 둔다.
  2. 달라졌으면 `npm run check`를 돌린다. 실패하면 출력 끝부분을 stderr로 내고 exit 2로 에이전트에게 돌려보낸다.
  3. 돌려보낸 뒤(`stop_hook_active`)에도 실패하면 더 막지 않고 사람에게 넘긴다. 무한 루프를 막기 위해서다.
- `npm run build`는 훅에 넣지 않는다. 느리고 `.next/`를 건드린다. `app/`을 바꿨을 때 돌리라고 `AGENTS.md`에 적는다.

## 버린 대안

- **`AGENTS.md`에 지시만 쓰기:** 모든 도구가 읽지만 강제력이 없다. 지금 상태가 이것이다.
- **git pre-commit 훅:** 도구와 사람 모두에 걸리지만, 커밋할 때만 돈다. 에이전트가 끝났다고 말하는 순간을 잡지 못하고, `--no-verify`로 넘길 수 있다. clone마다 `core.hooksPath` 설정도 필요하다.
- **CI(GitHub Actions):** push 뒤에야 신호가 온다. 에이전트가 작업 중에 스스로 고치는 루프가 되지 않는다.
- **편집할 때마다 검사(PostToolUse):** 작업 중간의 깨진 상태에서도 돌아서 신호가 시끄럽다.

## 감수하는 것

- **Antigravity에는 훅을 걸지 않았다.** 설정 파일(`.agents/hooks.json`)의 스키마와 "계속하라"는 응답 방식(stdout JSON)이 달라서 어댑터가 따로 필요하다. 지금은 `AGENTS.md`의 지시만 받는다.
- Codex는 프로젝트의 `.codex/`를 trust해야 훅이 로드된다. Windows에서의 명령(`commandWindows`)은 확인하지 않았다.
- 전역 gitignore가 `.claude/`를 무시하는 환경을 위해, 리포의 `.gitignore`에서 `.claude/settings.json`만 다시 포함한다. `settings.local.json`은 계속 제외한다.
- 이 훅은 **있는 테스트를 빠짐없이 돌리게 할 뿐**이다. 테스트가 닿지 않는 버그(예: PR #5에서 고친, 신용 손익이 엔 그대로 더해지던 버그)는 잡지 못한다.

## 다시 볼 조건

- 테스트가 닿지 않는 종류의 버그가 반복될 때. 금액·통화 불변식 검사(합계 = 계좌별 합, NaN·비정상 수익률 없음 등)나 화면 확인을 다음 검증으로 검토한다.
- Antigravity를 자주 쓰게 될 때. `.agents/hooks.json` 어댑터를 붙인다.
