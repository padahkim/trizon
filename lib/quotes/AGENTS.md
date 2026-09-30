# lib/quotes: 시세·환율

- **시세:** Yahoo Finance에서 받는다(`yahoo.ts`, `yahoo-finance2` v4). 비공식 API라 429나 crumb 오류로 가끔 깨진다. Node 전용 의존성이라 `next.config.ts`의 `serverExternalPackages`로 번들에서 뺀다.
- **환율:** `fxProviders`를 순서대로 시도한다. Yahoo(`KRW=X`, `JPY=X`)가 먼저이고, 실패하면 Frankfurter(ECB, 영업일 하루 1회 갱신)를 쓴다.
- **provider 계약(`types.ts`):** 못 찾은 심볼은 결과에서 빠지고, 네트워크·서버 오류는 throw한다. 서비스는 이 구분에 기대서 동작하므로 provider를 바꿀 때도 지킨다.

## 캐시 (`service.ts`)

- **메모리 캐시:** 15분 TTL. `invalidate()`(새로고침 버튼)는 다음 `get()` 한 번만 강제로 다시 받는다.
  - 응답에서 빠진 종목(못 찾은 심볼)도 조회는 성공한 것이라 TTL 동안 다시 묻지 않는다. 그동안에도 "시세를 받지 못한 종목" 경고는 계속 띄운다.
- **실패하면:** 마지막 성공값을 쓴다. 메모리에 없으면 `data/quotes-cache.json`에서 가져오고, `fromCache: true` 표시를 붙인다.
  - 실패 후 1분 동안은 다시 요청하지 않는다. 렌더마다 두드려 429를 악화시키지 않기 위해서다.
- **실패를 알리는 방식:** 이번 조회의 문제는 throw하지 않고 `errors[]`에 모은다. 대시보드가 이를 경고로 보여 준다.
  - 예외: 환율을 못 받았는데 저장된 환율도 없으면 `NoFxError`를 던진다. 이때 대시보드는 전용 오류 화면을 띄운다.
- **동시성:** `get()`은 직렬 큐로 처리해서 동시에 들어온 렌더가 캐시를 서로 덮어쓰지 않는다.

## 종목 추가 시 심볼 확정 (`resolve.ts`, `service.resolve()`)

- **후보:** `lib/domain/symbols.ts`가 만든다. 예를 들어 KR은 `.KS`와 `.KQ` 둘 다 후보가 된다.
- **확정:** 후보들을 캐시 없이 조회한 뒤 `pickBestQuote`로 고른다.
  - "먼저 응답한 후보"를 쓰면 안 된다. Yahoo는 없는 거래소 조합에도 옛 시세를 돌려준다(2026-09 관측: KOSDAQ `247540`에 `.KS`를 붙이면 2024-07 시세가 옴).
  - 그래서 통화가 맞는 후보 중 시세 시각이 가장 최근인 것을 고른다. 그것마저 5영업일보다 오래됐으면 거부한다.

## 확인

- `npm test`는 가짜 provider와 시계를 주입해서 네트워크 없이 돈다(`service.test.ts`, `resolve.test.ts`).
- 실제 응답은 `npm run quote:smoke -- 005930 7203 AAPL`로 확인한다.
