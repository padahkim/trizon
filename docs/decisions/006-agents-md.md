# 006. 에이전트 지침과 프로젝트 지식은 도구 중립 파일 한 벌로 둔다

- 상태: 채택 (2026-09-29, 2026-10-10 `docs/`로 정리)
- 관련: [PR #2](https://github.com/padahkim/trizon/pull/2)

## 맥락

- 이 리포는 코딩 에이전트 여러 개로 작업한다. Claude Code(회사 PC), Codex(집 PC), 가끔 Antigravity를 쓴다.
- 도구마다 지침 파일(`CLAUDE.md`, `.claude/`, `GEMINI.md`)을 따로 두면, 한쪽만 고쳐지고 나머지가 어긋난다.
- 설계 결정의 이유가 한 PC의 에이전트 메모리나 리포 밖 계획서에만 있으면, 다른 PC나 다른 도구에서는 없는 정보가 된다.

## 결정

- 진입점은 루트 `AGENTS.md` 하나다. `CLAUDE.md`·`CLAUDE.local.md`·`GEMINI.md`는 만들지 않는다.
- 문서는 리포 안의 도구 중립 위치에 둔다.
  - 지금 어떻게 동작하나: `docs/architecture.md`, 폴더별 `AGENTS.md`
  - 왜 그렇게 정했나: `docs/decisions/`
- `.claude/` 같은 도구 전용 폴더에는 문서를 두지 않는다.
- `@경로`는 Claude Code만 펼쳐 읽는다. 그래서 항상 "먼저 읽는다" 같은 문장과 함께 써서 다른 도구도 직접 열게 한다.

도구별 동작(PR #2 작성 당시 공식 문서 기준):

| 도구 | 루트 `AGENTS.md` | `@경로` | 폴더별 `AGENTS.md` |
|---|---|---|---|
| Claude Code (v2.1.277+) | `CLAUDE.md`가 없으면 직접 읽는다 | 펼친다 | 그 폴더 파일을 열 때 읽는다 |
| Codex | 읽는다 | 펼치지 않는다 | Git 루트부터 실행한 폴더까지만 읽는다 |
| Antigravity | 읽는다 | 펼치지 않는다 | 작업 중인 파일에서 루트까지 올라가며 읽는다 |

2026-10-10에 Claude Code 2.1.296에서 `CLAUDE.md` 없이 `AGENTS.md`와 거기서 `@`로 불러온 문서가 함께 로드되는 것을 확인했다.

## 버린 대안

- **`CLAUDE.md` + `.claude/docs/`:** Claude Code에서는 동작하지만 Codex·Antigravity가 읽지 않는다.
- **`CLAUDE.md`에 `@AGENTS.md` 한 줄:** 예전 방식이다. 파일이 하나 늘 뿐 얻는 것이 없고, `CLAUDE.md`가 있으면 Claude Code가 `AGENTS.md`를 직접 읽지 않는다.
- **도구마다 지침 파일:** 같은 내용을 여러 곳에서 고쳐야 하고, 결국 어긋난다.

## 감수하는 것

- Codex는 폴더별 `AGENTS.md`를 자동으로 읽지 않는 경우가 있다. 루트 `AGENTS.md`의 목록과 문장 지시로 대신한다.
- 에이전트 메모리나 계획서에서 나온 결정은 사람이 리포로 옮겨야 한다.

## 다시 볼 조건

- 도구들이 지침 파일을 읽는 방식을 바꿨을 때.
