# app/api: Route Handlers

쓰기(보유종목·계좌 저장·삭제, 시세 새로고침)는 Server Actions(`app/actions.ts`)가 한다. Route Handler는 클라이언트가 **입력하는 도중에** 불러야 하는 읽기 전용 API에만 쓴다. 지금은 아래 하나뿐이다.

## `GET /api/symbols?q=&market=` (`symbols/route.ts`)

`/holdings`의 종목 자동완성(`app/holdings/SymbolSearch.tsx`)이 부른다. 검색 로직과 목록 캐시는 `lib/symbols/`에 있고, 이 핸들러는 `getSymbolService().search()`를 부르는 얇은 층이다.

- **`q`:** 검색어이고 100자에서 자른다. **비어 있으면 결과 없이 목록만 준비한다.** 입력칸에 포커스가 가면 클라이언트가 이 요청을 한 번 보내서, 첫 실제 검색이 목록 다운로드를 기다리지 않게 한다.
- **`market`:** `KR`·`JP`·`US` 중 하나면 그 시장을 먼저 보여 준다. 그 밖의 값은 무시한다.
- **응답:** `lib/symbols/service.ts`의 `SymbolSearchResult`다.
  - 성공: `200 { ok: true, hits, fetchedAt, warnings }`
  - 목록을 받지 못함: `503 { ok: false, error }`
  - 클라이언트는 503이면 코드를 직접 입력하라고 안내한다.
- **클라이언트 쪽:** 150ms 디바운스를 두고, 새 입력이 오면 `AbortController`로 이전 요청을 취소한다. IME 변환 중의 Enter와 화살표는 가로채지 않는다.

## 이 Next.js 버전에서의 주의

- **캐시:** Route Handler는 기본으로 캐시되지 않는다. `request.nextUrl`을 읽으므로 요청마다 실행된다. 캐시가 필요하면 `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`를 먼저 읽는다.
- **파일 위치:** 같은 경로에 `page.tsx`와 `route.ts`를 함께 둘 수 없다.
