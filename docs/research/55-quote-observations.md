# 공개 시세 관찰 (#55)

확인일 2026-10-30(Asia/Tokyo), 코드 기준 `e01575ef0cb057c05b76eaca789f7fce447c17a3`, `yahoo-finance2@4.0.5`, Node 22.21.0. 계좌 API·자격증명·실제 보유 데이터는 사용하지 않았다. 아래는 공개 심볼의 **단일 시점 관찰**이며 지원 보장이나 합성 fixture의 원본이 아니다. 공급자 의미/이용 제한의 공식 근거는 [출처 조사](55-common-quotes-evidence.md), 채택한 규칙은 [계약](55-common-quotes-contract.md)에 있다.

## 기존 경로

`npm run quote:smoke` 성공: `JP:7203`, `JP:130A`, `US:AAPL`, `US:BRK.B`에서 현재가·전일종가·기대 통화·공급자 시각을 받았다. 한국은 기존 HTTP/adapter 경로에서 허용되지 않으므로 아래 직접 조회 성공을 앱의 한국 지원으로 간주하지 않는다.

## 직접 quote 조회

`requestStartedAt=2026-10-29T18:04:38.779Z`(일본·한국 10월 30일 03:04). 실행 출력에서는 이 값을 `receivedAt`이라는 변수명으로 표시했지만 실제로는 요청 시작 때 채집했으므로 수신 완료 시각으로 해석하지 않는다. 아래 재현 예에서는 이름을 바로잡았다. 실제 가격 시각과는 별개다.

| 심볼 | 가격/전일종가/통화 | `regularMarketTime` (UTC) | TZ로 변환한 가격 날짜/시각 | 조회 당시 `marketState` | exchange / fullExchangeName |
|---|---|---|---|---|---|
| `7203.T` | 모두 제공 / JPY | 2026-10-29T06:30:00Z | 10/29 15:30 Asia/Tokyo | PREPRE | JPX / Tokyo |
| `130A.T` | 모두 제공 / JPY | 2026-10-29T06:30:00Z | 10/29 15:30 Asia/Tokyo | PREPRE | JPX / Tokyo |
| `AAPL` | 모두 제공 / USD | 2026-10-29T18:04:37Z | 10/29 14:04:37 America/New_York (UTC−04) | REGULAR | NMS / NasdaqGS |
| `BRK-B` | 모두 제공 / USD | 2026-10-29T18:04:36Z | 10/29 14:04:36 America/New_York (UTC−04) | REGULAR | NYQ / NYSE |
| `005930.KS` | 모두 제공 / KRW | 2026-10-29T06:30:19Z | 10/29 15:30:19 Asia/Seoul | PREPRE | KSC / KSE |
| `035900.KQ` | 모두 제공 / KRW | 2026-10-29T06:30:05Z | 10/29 15:30:05 Asia/Seoul | PREPRE | KOE / KOSDAQ |

관찰 결과:

- 일본·한국은 수신 현지 날짜와 가격 현지 날짜가 달랐다. PREPRE라도 가격 필드는 과거 정규장의 값이다. 한국 시각을 일정한 15:30:00으로 잘라 저장하면 공급자 시각을 훼손한다.
- AAPL·BRK-B는 별도 `preMarketPrice`/`preMarketTime`도 제공했다. 각각 장전 마지막 시각은 2026-10-29T13:29:59Z / 13:29:57Z였다. 현재 adapter가 고르는 `regularMarket*`와 섞지 않았다.
- 네 일본·한국 표본에서 pre/post 필드가 없었고, 미국 두 표본에도 post 필드가 없었다. 아래 출력은 **누락과 null 모두 null로 표시**하므로 원시 JSON이 null이었음을 입증하지 않는다. 이 표본에서 필수 가격 필드의 null 상황은 관찰하지 못했다.
- `.KS/.KQ` 조회와 문자열 `005930` 보존은 관찰했으나 NXT 체결 포함 여부·KRX/NXT 통합 범위·다른 상품종류는 확인하지 못했다. 미래 날짜·분할 당일의 `regularMarketPreviousClose`도 이 조회로 확인하지 못했다.

재현(리포 루트, 설치된 Node 22.x):

```sh
node --input-type=module <<'JS'
import YahooFinance from 'yahoo-finance2';
const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'], versionCheck: false });
const fields = ['symbol', 'currency', 'regularMarketPrice', 'regularMarketPreviousClose',
  'regularMarketTime', 'marketState', 'exchangeTimezoneName', 'exchange',
  'fullExchangeName', 'preMarketPrice', 'preMarketTime', 'postMarketPrice', 'postMarketTime'];
const requestStartedAt = new Date().toISOString();
const rows = await yahoo.quote(['7203.T', '130A.T', 'AAPL', 'BRK-B', '005930.KS', '035900.KQ'],
  { return: 'array', fields }, { fetchOptions: { signal: AbortSignal.timeout(10000) } });
console.log(JSON.stringify({ requestStartedAt,
  rows: rows.map(row => Object.fromEntries(fields.map(field => [field, row[field] ?? null]))) }, null, 2));
JS
```

## 일봉: 휴일과 분할

2026-10-29T18:05:18Z에 `chart`를 두 번 읽었다. `interval='1d'`, `events='div|split'`, `fetchOptions.signal=AbortSignal.timeout(10000)`을 사용했다.

| 요청 | 관찰 | 이 관찰이 입증하지 않는 것 |
|---|---|---|
| `7203.T`, `period1='2026-10-08'`, `period2='2026-10-15'` | 10/8, 10/9, 10/13, 10/14, 10/15 봉 반환. 10/10~12 봉 없음. 각 `date`는 00:00Z(09:00 JST), 장 마감 시각 아님 | 모든 휴일의 처리, 응답 범위의 배타적 끝 날짜, 해당 날짜의 실시간 quote 전일종가 |
| `AAPL`, `period1='2020-08-27'`, `period2='2020-09-03'` | 8/31 `splitRatio='4:1'`, numerator=4, denominator=1. 8/28 `close≈124.8075`, `adjclose≈120.9557`; 8/31 `close≈129.0400`, `adjclose≈125.0575`. 일봉 `date`는 13:30Z(09:30 EDT) | 분할 당일 실제 quote 응답의 전일종가, 다른 기업행동, 매번 같은 조정 값 |

추론: 휴일은 달력 전날 봉을 찾는 방법으로 처리할 수 없고, 일봉 `date`를 현재가의 실제 체결/가격 시각으로 쓸 수 없다. AAPL 표본은 이미 4:1 주식 단위로 조정된 과거 `close`와 배당까지 반영한 `adjclose`가 다름을 보여준다. 이를 확인하지 않고 다시 분할 비율로 나누거나 `adjclose`를 PRD 주가 변동 기준으로 쓰면 틀린다. 공식 조정 정의는 출처 조사와 함께 판단한다.

재현 시 위 quote 예제의 `yahoo`로 다음을 실행한다. 과거 데이터는 공급자 수정으로 달라질 수 있으며 테스트의 고정 기대값으로 쓰지 않는다.

```js
for (const [symbol, period1, period2] of [
  ['AAPL', '2020-08-27', '2020-09-03'],
  ['7203.T', '2026-10-08', '2026-10-15'],
]) {
  const result = await yahoo.chart(symbol, { period1, period2, interval: '1d', events: 'div|split' },
    { fetchOptions: { signal: AbortSignal.timeout(10000) } });
  console.log({ symbol, timeZone: result.meta.exchangeTimezoneName,
    quotes: result.quotes.map(({ date, close, adjclose }) => ({ date, close, adjclose })),
    splits: result.events?.splits ?? [] });
}
```

## 코드 관찰과 검증 한계

- 라이브러리에서 `regularMarketPrice`, `regularMarketPreviousClose`, `regularMarketTime`, `currency`는 optional이다. 현재 adapter는 시간·통화·가격이 없으면 생략하고 전일종가만 없으면 시세를 유지한다. API wire의 `previousClose: null`은 현재 스키마와 호환되지 않는다.
- 현재 parser의 `csvQuote.asOf`는 CSV에 적힌 실제 시세시각이 아니라 `parsePortfolio`에 전달한 업로드 시각이다. 공통 `marketTime`으로 바꾸면 안 된다.
- 현재 평가에서는 시세가 통화 불일치/7일 초과이면 CSV→원가 순서다. CSV 대체의 JP/SBI 범위 제한과 미측정 표시는 후속 구현 항목이다. 7일은 공급자의 신선도 보증이 아니라 기존 앱 정책이다.
- 실제 계좌 관찰, 원시 응답의 null 사례, 정확한 전일종가 거래일/분할 당일 의미, 시간외/NXT 가격, 이용 조건의 개별 허가는 이번 실행으로 확인하지 않았다.

검증 명령(Node 22.21.0): `npx next typegen` → `npx tsc --noEmit`, `npm run lint`, `npm test` 모두 성공. 전체 단위/route 테스트는 12파일 119개다. 별도로 `yahoo.test.ts`·`evaluate.test.ts` 12개를 먼저 실행했다. JSON 파싱·33개 사례 ID 중복 없음·문자열 선행 0 보존·연구 문서의 로컬 링크·`git diff --check`도 확인했다. 새 자동 테스트나 앱 기능은 추가하지 않았으며 3단계 fixture의 기대 상태가 현재 앱에서 구현됐다고 검증한 것은 아니다.
