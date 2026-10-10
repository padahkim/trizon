---
type: golden-rules
tags: [consistency, duplicate-patterns, structure, money, date, ticker, store, server-actions, error, logging, test, dependency]
last_reviewed: 2026-10-11
---

# trizon Golden Rules

같은 일을 하는 방법이 리포에 둘 있으면, 근처 코드를 보고 따라 쓰는 에이전트는 절반 확률로 틀린 쪽을 고른다(50% 룰). 그래서 방법을 하나로 고정한다. 아직 지우지 못한 옛 방법은 5절 "폐기된 패턴"에 적어 따라 쓰지 않게 한다. 이렇게 정한 이유: docs/decisions/008-consistency-over-dry.md

이 문서는 "새 코드를 어디에, 어떻게 쓰나"만 다룬다. 지금의 구조와 동작은 docs/architecture.md, 외부 API·파일 형식은 폴더별 `AGENTS.md`에 있다.

## 1. 같은 일은 한 가지 방법으로

- 같은 일을 하는 두 번째 방법을 만들지 않는다. 표준이 맞지 않으면 표준을 고치고, 부르는 곳을 모두 같이 바꾼다.
- 따라 쓰려는 근처 코드가 5절에 있으면 그 코드 대신 3절의 표준을 쓴다.

## 2. 판단 기준: Consistency over DRY

DRY를 버리는 것이 아니다. "코드가 줄어드나"보다 "다음 에이전트가 예측할 수 있나"를 먼저 본다.

- **한 곳에 모은다:** 틀리면 돈이나 데이터가 틀리는 규칙. 금액 표시, 통화 환산, 종목코드 형식, 스키마, 저장 파일 읽기·쓰기, 쓰기 뒤에 다시 그릴 화면이 여기에 해당한다.
- **같은 모양으로 반복한다:** 한 줄 관용구(오류 메시지 꺼내기 등), 테스트 헬퍼, 화면 조립 코드. 반복할 때는 글자까지 같게 쓴다. 이름만 다른 래퍼를 만들지 않는다.
- **만들지 않는다:** 한 번만 쓰는 함수, 옵션으로 동작이 갈라지는 범용 래퍼. 예를 들어 저장소마다 다른 규칙(파일이 없을 때, 버전)을 옵션으로 받는 공통 reader는 만들지 않는다.
- 헷갈리면 이렇게 묻는다: "다음 에이전트가 이 근처 코드를 복사해도 맞는가?"

## 3. 표준: 이 일은 이렇게 한다

### 금액·숫자·날짜 표시

- 금액·수익률을 JSX로 보여 줄 때는 `<Money>`·`<Pct>`(app/_components/figures.tsx)를 쓴다. 정확한 금액 툴팁과 손익 색이 같이 붙는다.
- 문자열이 필요할 때(툴팁, prop, 경고 문구)만 `formatMoney`·`formatPercent`·`formatUnitPrice`·`formatQuantity`(lib/format/money.ts)를 직접 부른다.
- 통화 이름(원·엔·달러)은 `CURRENCY_SUFFIX`(lib/format/money.ts)에서 가져온다.
- `toLocaleString`과 `Intl`은 lib/format/ 안에서만 쓴다. 새 표시 형식이 필요하면 lib/format/에 함수를 더한다. 날짜·시각 표시는 lib/format/date.ts에 둔다.

### 통화·종목코드·스키마

- 통화 환산은 `convert()`(lib/portfolio/fx.ts)로 한다. 환율을 직접 곱하지 않는다.
- 종목코드·티커가 맞는 형식인지는 `quoteSymbolCandidates`(lib/domain/symbols.ts)로 판정한다. 정규식을 복사하지 않는다.
- 포트폴리오 파일과 폼의 스키마는 lib/domain/schema.ts에 둔다. 한 폴더만 쓰는 저장 파일의 스키마는 그 폴더의 `store.ts`(예: lib/sbi/store.ts)에 둔다.

### 저장 파일(data/)

- 쓰기는 `writeFileAtomic`, 읽기·쓰기 순서 보장은 `createSerialQueue`(lib/store/fs-utils.ts)로 한다.
- 읽는 순서는 lib/store/json-file.ts의 `read()`와 같게 쓴다: 파일 읽기 → `JSON.parse` → `safeParse`.
- 파일이 깨졌으면 `filePath`·`details`를 담은 오류를 던지고 **파일을 덮어쓰지 않는다**. 화면은 `FileErrorPanel`로 보여 준다.

### 화면·Server Actions

- 쓰기는 app/actions.ts의 Server Action이 한다. Route Handler는 입력하는 도중에 부르는 읽기 API에만 쓴다(app/api/AGENTS.md).
- 쓰기 액션은 데이터를 읽는 화면 `/`·`/holdings`·`/sbi`를 모두 revalidate한다. /sbi도 계좌를 읽고, /holdings도 SBI 종목 수를 읽기 때문이다.
- 폼에 들어온 숫자("1,234", " 12.5 ")는 서버 스키마의 `toNumber`(lib/domain/schema.ts)와 같은 규칙으로 읽는다. 콤마와 공백을 지우고, 빈 칸은 값 없음으로 본다.
- 링크는 `hrefWith`(app/_components/href.ts)로 만들고, 삭제 확인은 `ConfirmSubmit`으로 받는다.

### 오류

- 페이지에서는 예상한 오류만 잡는다: `catch (err) { if (!(err instanceof X)) throw err; … }`. 아무것도 확인하지 않는 `catch {}`는 버그까지 숨기므로 쓰지 않는다.
- 오류 메시지는 `err instanceof Error ? err.message : String(err)`를 그 자리에 그대로 쓴다. 헬퍼로 감싸지 않는다.

### 로그

- lib/는 로그를 찍지 않는다. 사용자가 알아야 할 문제는 결과의 `warnings`로 돌려준다.
- 서버의 진단 로그는 한 줄 JSON(JSON line)으로 쓴다: `console.error(JSON.stringify({ ts: new Date().toISOString(), event: "snapshot_failed", error: … }))`.
  - `event`는 snake_case로 "무엇이 일어났나"를 적는다. 값은 문자열·숫자로만 넣는다.
  - 에이전트가 `jq`로 골라 읽고 자기 작업을 확인할 수 있게 하려는 것이다.
- scripts/의 스모크 출력은 사람이 읽는 텍스트라 예외다.

### 시계·테스트

- 현재 시각은 주입받는다. 순수 함수는 `now: Date` 인자로, 서비스는 `now?: () => Date` 옵션으로 받는다.
  - lib/에서는 옵션의 기본값(`opts.now ?? (() => new Date())`) 말고는 인자 없는 `new Date()`를 부르지 않는다.
- 테스트는 대상 파일 옆 `*.test.ts`에 두고, 네트워크 없이 가짜 provider·시계·임시 폴더로 돌린다(docs/decisions/005-node-test.md).
- 임시 폴더는 테스트 파일마다 같은 모양의 `withTempDir`를 둔다. 공용 테스트 헬퍼 파일은 만들지 않는다.

### 의존성

- 새 npm 의존성은 추가하기 전에 사용자에게 묻는다. 채택하면 docs/decisions/에 기록을 남긴다.

## 4. 어디에 두나

- **lib/<도메인>/:** 역할이 같으면 이름을 맞춘다. `types.ts`(타입), `parse.ts`(외부 형식 파서), `service.ts`(캐시·외부 호출), `store.ts`(data/ 파일)로 짓고, 옆에 `*.test.ts`를 둔다. 그 밖의 파일은 하는 일을 이름으로 쓴다(`calc.ts`, `fx.ts`, `yahoo.ts`).
- **폴더별 지침:** 외부 API·파일 형식을 다루는 폴더에는 `AGENTS.md`를 두고, 루트 `AGENTS.md`의 "폴더별 지침"에 등록한다.
- **여러 도메인이 쓰는 것:** 규칙은 lib/domain/, 표시 포맷은 lib/format/에 둔다. 서버 싱글턴은 lib/server.ts에 둔다(`next` import 규칙은 루트 `AGENTS.md`의 "TypeScript 규칙").
- **app/<route>/:** `page.tsx`, 그 화면만 쓰는 컴포넌트, 그 화면의 `.module.css`를 둔다. 두 화면 이상이 쓰는 컴포넌트는 app/_components/로 옮긴다.
- 새 종류의 위치가 필요하면 코드보다 이 절을 먼저 고친다.

## 5. 폐기된 패턴: 따라 쓰지 말 것

아래는 아직 리포에 남아 있는 옛 방법이다. 근처에 있어도 따라 쓰지 말고 3절의 표준을 쓴다. 고치면 이 목록에서 지운다.

### 죽은 코드

- **`isSbiKind`(lib/sbi/types.ts):** 아무도 부르지 않는다. 종류 판정은 `isSbiImportKind`로 한다.
- **`PARSERS.usTrades`(lib/sbi/parse.ts):** 어느 경로에서도 닿지 않는다. 약정이력은 `parseUsTrades`를 직접 부른다.
- **쓰는 곳이 없는 것:** `HoldingFormInput`·`AccountFormInput` 타입(lib/domain/schema.ts), `ConfirmSubmit`의 `className` prop, app/globals.css의 `.field .label`과 `[data-theme="dark"]` 블록.

### lib/

- **파일 오류 클래스 두 벌:** `PortfolioFileError`(lib/store/types.ts)와 `SbiImportFileError`(lib/sbi/store.ts)는 필드까지 같다.
- **zod 오류 문장 세 벌:** lib/store/json-file.ts, lib/sbi/store.ts, app/actions.ts(`saveSbiUsHoldings`)에 같은 `issues.map(…)`가 있다.
- **US 약정이력 parse → merge → infer 세 벌:** lib/sbi/parse.ts의 `loadUsTrades`와 app/actions.ts `importSbiCsv` 안의 두 곳에 있다.
- **티커·종목코드 정규식 복사본:** lib/sbi/parse.ts `normalizeUsTicker`, lib/sbi/store.ts의 `ticker` 스키마, scripts/quote-smoke.ts `guessMarket`. 판정은 `quoteSymbolCandidates`로 한다.
  - lib/sbi/group.ts의 `splitSecurityName`은 종목명 끝에서 코드를 떼어 내는 용도다. 형식 판정에 쓰지 않는다.
- **오류 메시지 래퍼:** `message()`(lib/quotes/service.ts)와 `reason()`(lib/symbols/sources.ts). 3절의 관용구를 그대로 쓴다.
- **결과 타입 다섯 벌:** `{ ok: false; error }`를 lib/domain/symbols.ts, lib/quotes/resolve.ts, lib/portfolio/cost-basis.ts, lib/symbols/service.ts, lib/sbi/types.ts(`Parsed<T>`)가 각자 정의한다. `Parsed<T>`만 값을 `data`로 감싼다. 새 코드는 같은 폴더의 기존 모양을 따르고, 폴더에 없으면 `Parsed<T>` 모양으로 쓴다.
- **비치명 메시지 이름:** lib/quotes/service.ts만 `errors[]`이고 나머지는 `warnings[]`다. 새 코드는 `warnings`를 쓴다.
- **시계 직접 호출:** lib/symbols/sources.ts와 lib/quotes/frankfurter.ts가 `new Date()`를 직접 부른다.
- **캐시 정책 이름:** TTL 옵션이 lib/quotes/service.ts는 `ttlMs`, lib/symbols/service.ts는 `maxAgeMs`다. `RETRY_AFTER_FAILURE_MS`도 두 서비스에 따로 있다. 새 캐시는 `ttlMs`를 쓴다.
- **저장 파일 버전 정책 세 가지:** lib/sbi/store.ts는 v1을 읽고 다음 쓰기에서 v2로 올린다. lib/symbols/service.ts는 `version`이 다르면 다시 받는다. quotes 캐시는 버전이 없다. 새 저장 파일은 `version`을 두고 lib/sbi/store.ts 방식으로 올린다.
- **평균단가 계산이 여러 벌:** lib/sbi/evaluate.ts 안에 가중평균이 두 방식(`addTo`, 인라인 `reduce`)으로 있다. 매도 때 취득원가를 줄이는 계산도 lib/sbi/us-trades.ts와 lib/portfolio/cost-basis.ts `scaleCostBasis`에 따로 있다. 새로 필요하면 복사하지 말고 먼저 하나로 정리한다.
- **실수 오차 지우기:** `Number(v.toFixed(10))`가 `cleanMoney`(lib/sbi/parse.ts)와 `clean`(lib/sbi/us-trades.ts)이라는 다른 이름으로 있다.
- **NFKC 정규화 범위:** SBI CSV 셀(lib/sbi/csv.ts)과 종목 검색(lib/symbols/search.ts)은 NFKC를 거치지만, 폼의 종목코드(`quoteSymbolCandidates`)는 거치지 않는다. 그래서 전각으로 입력한 코드는 폼에서 거부된다.
- **테스트 임시 폴더:** lib/sbi/store.test.ts는 `withDir`, lib/store/snapshots.test.ts는 인라인 try/finally를 쓴다. 나머지는 `withTempDir`다.

### app/

- **다시 그릴 화면 범위:** 계좌·보유종목 액션(`saveHolding`·`deleteHolding`·`addAccount`·`deleteAccount`)은 `/sbi`를 revalidate하지 않는다. SBI 액션은 세 화면을 모두 한다.
- **아무것도 확인하지 않는 `catch {}`:** app/holdings/page.tsx의 시세 조회와 SBI 저장 파일 읽기, 두 곳이다.
- **폼 숫자 읽기 세 벌:** `toNumber`(lib/domain/schema.ts), `num()`(app/holdings/HoldingForm.tsx, 주석에 스스로 복사본이라고 적혀 있다), `Number()`(app/sbi/UsHoldingsEditor.tsx). 마지막 것은 콤마를 지우지 않아서 "1,000"을 넣으면 실패한다.
- **진단 로그:** app/page.tsx의 `console.error("snapshot", e)`는 JSON line이 아니다.
- **`CURRENCY_NAME`(app/page.tsx):** `CURRENCY_SUFFIX`와 값이 같은 복사본이다.
- **날짜·시각 표시 다섯 벌:**
  - `formatMonthDay`(lib/format/date.ts)
  - `timeText` 두 개: app/page.tsx는 월·일이 두 자리, app/sbi/page.tsx는 한 자리다.
  - `ymd`(app/sbi/page.tsx)
  - 표시에 쓰는 `localDate`(lib/store/snapshots.ts → app/holdings/page.tsx)
  - 새 코드는 lib/format/date.ts에 함수를 더해 쓴다.
- **평균 매입환율 표시 세 벌(자릿수가 다르다):** app/holdings/HoldingForm.tsx `rateText`, app/holdings/page.tsx의 인라인 `toLocaleString`, app/page.tsx의 `formatUnitPrice`. 새 코드는 lib/format/money.ts에 함수를 더한다.
- **`<Money>`를 손으로 다시 만든 곳:**
  - app/page.tsx와 app/sbi/page.tsx의 hero 금액.
  - app/sbi/page.tsx 안의 `money` 클로저 세 개. 이름은 같은데 동작이 다르다.
  - JSX 안에서 바로 부른 `formatMoney`. 정확한 금액 툴팁이 빠진다.
  - 수량 단위(주·좌)와 빈 값 "—" 표시도 화면마다 다르다.
- **폼 상태 처리 네 가지:** `useActionState`(AccountForm·HoldingForm·UsHoldingsEditor), `useFormStatus`(RefreshButton), `useTransition`(SbiImport), pending 표시 없음(삭제 폼). 초기값도 `{ ok: true }`와 `{ ok: false }`가 섞여 있다. 새 폼은 `useActionState`와 `{ ok: true }`로 시작한다.
- **CSS·화면 조각 복사:**
  - app/page.module.css와 app/sbi/sbi.module.css에 같은 클래스 14개(`stack`·`controls`·`kpi*`·`notices` 등)가 있다.
  - 두 파일에서 `.hero`의 뜻이 서로 반대다. 대시보드의 `.hero`는 SBI의 `.heroMain`이고, 대시보드의 `.heroPanel`은 SBI의 `.hero`다.
  - 통화 스위치·새로고침 JSX와 가격 상태 표시(`PriceBadge`·`PriceNote`)도 두 화면에 따로 있다.
  - 두 화면이 같이 쓸 스타일·조각은 복사하지 말고 app/_components/(또는 app/globals.css)로 옮긴다.
- **CSS modules 안에서 전역 클래스를 가리키는 셀렉터:** `.basisRow .field`(app/holdings/holdings.module.css)와 `.years li > .num`(app/sbi/sbi.module.css)은 클래스 이름이 바뀌어 적용되지 않는다. 전역 클래스는 `:global(.field)`처럼 쓴다.

## 6. 경쟁 패턴을 찾으면

1. 표준을 하나 고른다. 이 문서 → 부르는 곳의 수 → 더 최근 코드 순으로 정한다.
2. 같은 PR에서 나머지를 표준으로 바꾼다. 범위가 커서 못 하면 5절에 "어디에 있나 / 새 코드는 무엇을 쓰나"를 적는다.
3. 기계로 검사할 수 있으면 `npm run check`가 잡도록 테스트를 더한다.
4. frontmatter의 `last_reviewed`를 오늘 날짜로 바꾼다.

## 7. 정기 감사

분기마다, 그리고 큰 기능을 머지한 뒤에 한다. 에이전트에게 "docs/golden-rules.md 7절대로 감사해 줘"라고 맡겨도 된다.

- **패턴 오염:** 같은 일을 하는 두 방법이 새로 생겼나. 5절 목록이 줄었나. 아무도 부르지 않는 export·CSS가 있나.
- **구조:** 새 파일이 4절의 위치에 있나. 새 폴더의 `AGENTS.md`가 루트 목록에 있나.
- **로그:** console 사용이 3절 "로그" 규칙대로인가.
- **문서:** docs/architecture.md와 폴더별 `AGENTS.md`가 코드와 맞나. 이 문서의 `last_reviewed`가 오래되지 않았나.
