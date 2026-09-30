# trizon 아키텍처

## 구조

- `lib/server.ts`: 서버 싱글턴(저장소·시세 서비스·종목 검색 서비스·SBI CSV 저장소)을 `globalThis`에 둬서 dev 핫리로드 때도 캐시와 쓰기 락이 유지된다. 앱 코드는 `getStore()`·`getQuoteService()`·`getSymbolService()`·`getSbiStore()`로만 접근한다. 나머지 `lib/`는 순수 모듈이라 테스트에서 가짜 provider·시계·파일 경로를 주입한다.
- `lib/domain/`
  - `model.ts`: 의존성 없는 상수.
  - `schema.ts`: zod 스키마이자 타입의 단일 출처(`z.infer`). 저장 파일과 폼 입력이 같은 스키마를 쓴다.
  - `symbols.ts`: 종목코드 형식 규칙(KR 6자리, JP 4자리, US 티커 → Yahoo 심볼 후보)은 여기 한 곳에만 둔다. 폼 검증과 종목 목록 파서가 모두 이 파일을 쓴다.
- `app/`
  - `page.tsx`(대시보드), `holdings/`(입력 화면), `sbi/`(SBI CSV 가져오기·누적손익)는 서버 컴포넌트이고, 쓰기는 `app/actions.ts`의 Server Actions가 한다.
  - `sbi/SbiImport.tsx`는 화면 어디에 떨군 파일이든 받아 `importSbiCsv`로 올린다. 종류는 서버가 내용으로 가린다.
  - Route Handler는 `app/api/symbols/route.ts`(종목 자동완성) 하나뿐이다.
- 외부 API·파일 형식을 다루는 `lib/quotes/`·`lib/symbols/`·`lib/sbi/`와 `app/api/`의 세부 규칙은 각 폴더의 `AGENTS.md`에 있다(루트 `AGENTS.md`의 "폴더별 지침").

## 금액·통화 모델

- 거래통화는 계좌가 아니라 **시장**이 정한다(`TRADE_CURRENCY`: KR→KRW, JP→JPY, US→USD). 계좌에는 계좌통화(`homeCurrency`)가 따로 있다. 예를 들어 SBI의 미국 주식은 USD로 거래하고 JPY로 평가한다.
- 종목은 계좌통화 기준으로 평가해서 증권사 화면의 수익률과 맞춘다.
  - 해외 종목은 `costBasisHome`(계좌통화 기준 **총** 매입금액)이 있어야 환차손익까지 맞는다. 없으면 현재 환율로 환산하고 환율효과는 빠진다(`fxEffectIncluded`).
  - SBI는 1주당 금액(取得単価 円換算)으로 보여 주므로 입력만 1주당으로 받고, 저장은 항상 총액이다(`lib/portfolio/cost-basis.ts`).
- 합계는 계좌마다 계좌통화 금액을 현재 환율로 표시 통화에 모은다. 그래서 표시 통화를 바꿔도 총수익률이 같다. 환율은 USD=1 기준(`FxRates`)으로 교차 환산한다.
- SBI 포트폴리오 CSV의 보유종목은 `portfolio.json`에 쓰지 않고, 대시보드를 그릴 때 SBI 계좌의 가상 보유종목으로 합친다(`lib/sbi/evaluate.ts`).
  - 투자신탁은 시세가 없어 CSV 기준가(`Quote.imported`, 상태 `imported`)로 평가한다. 기준가는 1만좌당이라 `Holding.priceUnit`(10000)으로 나눈다.
- 시세가 없거나 시세 통화가 거래통화와 다르면 평가액을 매입액으로 두고 `missing`으로 표시한다. 합계에서 조용히 빠지지 않게 하려는 것이다. 5영업일보다 오래된 시세는 `stale`로 표시한다.

## 데이터 파일 (`data/`, git 제외)

- `portfolio.json`: 계좌와 보유종목.
  - 쓸 때는 임시 파일에 쓴 뒤 rename하고(원자적 쓰기), 요청을 직렬 큐로 하나씩 처리한다.
  - JSON이나 스키마가 깨져 있으면 `PortfolioFileError`를 던지고 **파일을 절대 덮어쓰지 않는다**. 화면에는 복구 안내가 뜬다.
- `snapshots.jsonl`: 대시보드를 그날 처음 열 때 `after()`로 한 줄 추가한다. 환율도 같이 남긴다. 지나간 날은 나중에 채울 수 없다.
  - 그날 기록은 나중에 고쳐도 덮어쓰지 않는다. 그래서 SBI CSV의 행·표·페이지가 빠졌거나, 종목이 직접 입력과 겹치거나, 넣은 CSV를 읽지 못해 합계가 틀린 줄 알 때는 남기지 않는다(`SbiDashboard.unreliable`).
- `sbi-imports.json`: 종류(실현손익·포트폴리오·배당)마다 마지막으로 넣은 SBI CSV 원문. 읽을 때마다 파싱한다. 깨져 있으면 덮어쓰지 않는다.
- `quotes-cache.json`, `symbols.json`: 지워도 되는 캐시.
