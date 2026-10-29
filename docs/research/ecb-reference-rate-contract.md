# ECB 일별 참고환율 공급 계약과 발표 달력

- 대상: [이슈 #54](https://github.com/padahkim/trizon/issues/54), 앱 기능 구현과 분리된 spike.
- 공식 문서 확인일: **2026-10-30 (Asia/Tokyo)**. 실응답 수집시각은 아래 UTC 기록으로 따로 남긴다.
- 근거를 `공식 문서`, `실제 관찰`, `제품 결정`으로 구분한다. 합성 장애 예시는 ECB 장애를 관찰했다는 뜻이 아니다.

## 선택한 공급 경로

**제품 결정:** ECB가 직접 제공하는 최신 일별 XML을 단일 공급 경로로 쓴다.

```text
GET https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
```

**공식 문서:** ECB [환율 안내](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)의 `Downloads → Latest reference rates → XML`이 이 파일을 가리킨다. USD·JPY·KRW는 EUR를 기준으로 표시된다. 장중 환율이나 체결 가능 가격이 아닌 정보용 참고환율이다.

**실제 관찰:** 키·로그인·Authorization/Cookie 요청 헤더 없이 공개 GET이 HTTP 200, `Content-Type: text/xml`로 성공했다. 다른 공급자의 기본 혼합값이나 제삼자 JSON을 ECB 값으로 사용하지 않는다. 선택하지 않은 ECB Data Portal API나 JSON 경로의 운영 가능성을 검증 완료로 간주하지 않는다.

| 조건 | 확인 결과와 계약 |
| --- | --- |
| 비용 | 공개 통계는 상업·비상업 용도에 무료로 재사용할 수 있다. [ESCB 재사용 정책](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html) |
| 인증 | 선택한 XML의 무인증 GET 성공을 직접 확인했다. 향후 접근 조건의 영구 보장은 아니다. |
| 호출 한도 | 검토한 공식 환율 안내·재사용 정책에는 이 XML의 숫자 할당량이 없으며 실제 헤더에도 한도 정보가 없었다. **무제한으로 해석하지 않는다.** 예외적으로 접근이 제한될 수 있다. [재사용 정책](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html) |
| 출처 표시 | 원자료를 정확하게 유지하고 `Source: ECB statistics.` 및 공식 환율 안내 링크를 표시한다. 통계·메타데이터의 원본을 보존한다. [재사용 정책](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html) |
| 파생값 표시 | 교차환율·환산 금액은 앱 계산임을 명시한다. 원자료 자체를 수정된 ECB 통계로 배포하지 않는다. 유료 판매 문서에 포함하면 구매 전과 접근할 때마다 ECB에서 무료로 얻을 수 있음을 안내한다. 상업용 링크는 프레임 안에 가두지 않는다. [저작권 조건](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html) |
| 가용성 | 연속 제공·오류 없는 서비스·정시 게시 SLA는 없다. ECB가 서비스를 중단 없이 제공한다고 보장하지 않는다. [면책 조항](https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html) |

## 실응답 증거

원문: [daily.xml](fixtures/ecb/daily.xml), HTTP 헤더: [daily.headers.txt](fixtures/ecb/daily.headers.txt), 수집 메타데이터와 SHA-256: [daily.capture.json](fixtures/ecb/daily.capture.json). XML은 수집 바이트 그대로이며, 헤더 텍스트는 줄 끝을 LF로 정리하고 행 끝 공백만 제거했다.

| 항목 | 실제 관찰 |
| --- | --- |
| `collectedAt` | `2026-10-29T18:04:05.512Z` = 2026-10-30 03:04:05.512 JST. 로컬 응답 파일 쓰기 완료시각을 기록했다. |
| XML `Cube@time` | `2026-10-29` — **날짜 정밀도** |
| USD | 1 EUR = 1.1130 USD |
| JPY | 1 EUR = 175.92 JPY |
| KRW | 1 EUR = 1488.40 KRW |
| HTTP `Date` | `Thu, 29 Oct 2026 18:04:05 GMT` — 응답 서버의 HTTP 시각 |
| HTTP `Last-Modified` | `Thu, 29 Oct 2026 14:56:18 GMT` — 파일 수정시각이며 환율 관측시각이 아니다. |
| HTTP `Cache-Control` | `max-age=300` — 이 응답에서 관찰한 전송 캐시 지시이며 미래 응답의 보장은 아니다. |

수집 당시 프랑크푸르트는 2026-10-29 19:04 CET로, 당일 16:00 예정시각 이후였다. 응답 관측일도 10월 29일로 일치했다. 이 한 번의 관찰만으로 연중 정시 발표를 검증했다고 주장하지 않는다.

XML은 `http://www.ecb.int/vocabulary/2002-08-01/eurofxref` 네임스페이스 안의 한 `Cube@time` 아래 통화별 `Cube@currency`, `Cube@rate`를 담는다. 같은 날짜의 USD·JPY·KRW 전체 세트를 한 번에 취급할 수 있음을 원문으로 확인했다.

## 단위와 시각의 계약

**제품 결정:** EUR 기준 원자료 `unitsPerEur`와 `observationDate: YYYY-MM-DD`, 실제 수집시각 `collectedAt: UTC instant`, 고정 출처 URL을 분리해서 보존한다. `observedAt = observationDate + 16:00`이나 `14:10`처럼 가짜 관측시각을 만들지 않는다. 예정 발표시각은 지연 판정용 달력 정보다.

필수 통화 세 개가 모두 같은 날짜에 있고 각각 유한한 양수인 경우에만 원자적으로 채택한다. 날짜가 다르거나 일부 통화가 없으면 이전 날짜의 통화를 섞지 않는다. 수집시각·HTTP 수정시각이 새로워져도 관측일은 새로워지지 않는다.

환산은 다음 한 방향을 고정한다. `rate[from][to]`의 단위는 **1 from당 to**다.

```text
rate[from][to] = unitsPerEur[to] / unitsPerEur[from]
convertedAmount = amountInFrom * rate[from][to]
```

실응답의 교차환율 예: 1 USD = 약 158.0592991914 JPY, 약 1337.2866127583 KRW; 1 JPY = 약 8.4606639382 KRW. 이는 ECB가 별도로 발표한 USD·JPY·KRW 교차환율이 아니라 보존한 EUR 원자료로 앱이 계산한 파생값이다. 계산 중간에는 화면 표시용 반올림을 적용하지 않는다.

## 발표 달력과 서머타임

**공식 문서:** ECB는 TARGET 휴무일을 제외한 영업일에 통상 약 16:00에 게시한다. 협의 절차의 통상 시각 14:10과 게시 시각을 구분한다. [환율 안내](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)

공식 [FX Contact Group 2016-02-18 회의록 §2](https://www.ecb.europa.eu/paym/groups/pdf/fxcg/2016/0218/2016-02-18_summary.pdf)는 발표 일정을 **16:00 CET/CEST, as applicable**로 명시한다. 따라서 `UTC+01:00` 고정 오프셋 대신 프랑크푸르트의 IANA 시간대 `Europe/Berlin`을 사용한다. 겨울에는 15:00Z = 다음 날 00:00 JST, 여름에는 14:00Z = 23:00 JST다. 2026년 서머타임 전환일은 3월 29일과 10월 25일이다. [EU 공식 일정](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=oj%3AJOC_2021_149_R)

| 고정 날짜 | Europe/Berlin 16:00의 UTC 표현 | 확인 목적 |
| --- | --- | --- |
| 2026-03-27 (금) | 2026-03-27T15:00:00Z | 서머타임 시작 전 |
| 2026-03-30 (월) | 2026-03-30T14:00:00Z | 서머타임 시작 후 |
| 2026-10-23 (금) | 2026-10-23T14:00:00Z | 서머타임 종료 전 |
| 2026-10-26 (월) | 2026-10-26T15:00:00Z | 서머타임 종료 후 |

**공식 달력:** [ECB public holidays](https://www.ecb.europa.eu/ecb/contacts/working-hours/html/index.en.html)의 별표 `*`가 TARGET closing day를 뜻한다. 모든 ECB 직원 휴일을 환율 휴일로 취급하면 안 된다. 주말과 아래 TARGET 휴무일만 정상 발표 예정에서 제외한다.

| 해 | TARGET 휴무일 |
| --- | --- |
| 2026 | 01-01, 04-03 (성금요일), 04-06 (부활절 월요일), 05-01, 12-25, 12-26 |
| 2027 | 01-01, 03-26 (성금요일), 03-29 (부활절 월요일), 05-01, 12-25, 12-26 |

12월 24일·31일, 승천일 등 별표 없는 직원 휴일은 TARGET 휴무일이 아니다. 해당 날짜가 평일이면 정상 발표 예정에 포함한다. 장래 연도는 공식 TARGET 달력을 갱신해서 적용해야 하며 일본·한국·미국 증시 달력으로 대체하지 않는다.

## 근거의 한계

- 실응답은 선택한 XML 경로와 동일 날짜 전체 세트의 접근 가능성을 확인한다. 배포 환경의 네트워크·캐시 지속성·예약 실행 권한은 별도로 검증해야 한다.
- [Data Portal 웹서비스 안내](https://data.ecb.europa.eu/help/getting-data-web-services-sdmx-0)도 공식 통계의 프로그램 접근을 설명하지만, 이번 spike의 선택 경로는 직접 XML이다. API 문서 일부는 웹 조회에서 503/timeout이 나왔으며, 이를 XML 서비스의 장애로 해석하지 않는다.
- 발표시각은 공식 문서상 `around`다. 정확히 그 순간의 미갱신을 공급자의 SLA 위반이라고 부르지 않는다. 합계 사용 가능 여부와 유예 종료는 아래 제품 정책으로 정해야 한다.

## 확정한 지연 판정 정책

**제품 결정:** 발표 예정 경계는 TARGET 영업일의 **Europe/Berlin 16:00 정각**으로 둔다. 공식 게시가 `약 16:00`이므로 이 경계는 앱의 보수적인 사용 기한이며 ECB의 정시 제공 보장을 뜻하지 않는다. 별도의 분 단위 여유 시간을 덧붙이지 않는다. 경계 이후 새 전체 세트가 오면 즉시 다시 판정한다.

마지막으로 검증한 전체 세트의 관측일을 `D`라고 한다. `D` 다음 TARGET 영업일의 16:00을 `firstExpectedAt`, 그다음 TARGET 영업일의 16:00을 `graceEndsAt`으로 계산한다. 두 값은 예정시각이며 원자료의 관측시각으로 저장하지 않는다.

| 조건 | 상태 | 통합 환산 사용 |
| --- | --- | --- |
| 검증된 전체 세트가 없음 | `withheld` | 즉시 보류 |
| `now < firstExpectedAt` | `current` | 사용. 마지막 발표일 기준이며 장중 현재 환율이라는 의미는 아니다. |
| `firstExpectedAt <= now < graceEndsAt`이고 새 전체 세트 미수신 | `grace` | 마지막 성공 세트 사용, 관측일과 지연 표시 |
| `now >= graceEndsAt`이고 여전히 미갱신 | `withheld` | 통합 합계 보류, 계좌통화별 합계·미국주식 USD 손익으로 복귀하는 후속 구현에 전달 |

이는 `D` 이후 이미 지난 발표 예정 횟수가 0 / 1 / 2회 이상인지로도 계산할 수 있다. 주말과 TARGET 휴일은 횟수를 늘리지 않는다. 발표 한 번을 놓친 뒤 **다음 영업일 발표 직전까지** 유예한다. 금요일 관측값은 월요일 발표 실패 때 유예되지만 화요일 16:00에도 금요일 값이면 보류한다.

접속일·마지막 요청일·최초 실패를 알아챈 시각은 유예의 시작점이 아니다. 서버가 꺼져 있거나 오랫동안 접속하지 않았더라도 관측일과 현재 시각으로 기한을 재구성한다. 화요일에 처음 접속하거나 같은 금요일 응답을 HTTP 200으로 다시 받아 `collectedAt`이 갱신되어도 기한은 늘어나지 않는다. 화요일에 뒤늦게 받은 월요일 전체 세트는 한 발표 뒤처진 `grace`, 화요일 전체 세트는 `current`다.

### 응답·캐시 채택 규칙

- 고정 ECB 경로의 한 응답에서 정확히 한 관측일과 USD·JPY·KRW 전체 세트를 읽는다. 각 값은 유한한 양수여야 한다. 누락·중복·숫자 변환 실패·0·음수·NaN·무한대·날짜 혼합·잘못된 날짜는 전체 응답을 거부한다. 관측일이 수집일의 프랑크푸르트 날짜보다 미래이거나 TARGET 비영업일이어도 거부한다.
- 저장에서 복원한 캐시도 같은 전체 세트 검증을 통과해야 한다. 부분 캐시는 사용 가능한 캐시가 아니다. 새 전체 세트가 오기 전까지 없는 통화를 이전 날짜 값·다른 공급자·0으로 채우지 않는다.
- 새 응답의 관측일이 기존 전체 세트보다 과거면 기존 값을 유지한다. 같은 관측일의 수정된 전체 세트는 통째로 채택할 수 있지만 사용 기한은 그대로다. 더 최근 관측일을 채택한 뒤 그 날짜에서 기한을 다시 계산한다.
- HTTP 429·5xx·timeout·파싱 실패는 기존 전체 캐시와 그 관측일을 유지한다. 요청 결과 분류와 `lastAttemptAt`을 성공 세트의 `collectedAt`과 분리한다. 캐시를 유지한다는 이유만으로 기한이 지난 세트를 환산에 사용하지 않는다.
- 이 spike의 합성 timeout은 **10초 제한에 도달한 결과**를 주입한다. 429에는 공급자가 `Retry-After`를 주면 그때까지 재호출하지 않는 계약을 후속 구현에 전달한다. 숫자 할당량과 실환경 429·10초 timeout의 실제 발생은 확인하지 않았다. 오류 상태에서 반복 접속하거나 재시도해도 `graceEndsAt`은 바뀌지 않는다.
- 검증한 달력 범위는 **2026~2027년**이다. 범위 밖은 확인되지 않은 달력으로 처리하고 환산을 보류한다. 후속 구현은 공식 달력과 시간대 데이터를 갱신한 뒤 범위를 연장한다. 클라이언트 시계가 수집시각보다 과거인 경우도 보류하고 서버 시각을 다시 확인한다.

## 재현 가능한 고정 사례

[독립 실행 스크립트](../../scripts/spikes/ecb_contract.py)는 Python 3.10 이상 표준 라이브러리의 XML 파서·IANA 시간대를 사용한다. 앱·DB·브라우저·외부 네트워크를 부르지 않는다. 이는 공급 계약과 판정의 참조 예시이며 앱 provider·캐시 영속화 구현은 후속 #57·#58 범위다. TDD로 확정할 앱 공개 인터페이스도 그 구현에서 합의한다.

```sh
python3 scripts/spikes/ecb_contract.py
```

스크립트는 먼저 보존한 실응답의 SHA-256·관측일·세 통화를 검증하고, 이후 **합성 XML과 고정 UTC 시각**으로 아래 사례를 독립 기대값과 비교한다. 각 `PASS`와 마지막 완료 문구를 출력하며, 하나라도 다르면 0이 아닌 종료 코드를 반환한다. 실행 시점의 최신 ECB 값과 비교하지 않으므로 오프라인에서 같은 결과를 얻는다.

표의 합성 금요일 세트는 `D=2026-10-30`, `collectedAt=2026-10-30T16:05:00Z`, `1 EUR = 1.25 USD = 200 JPY = 1500 KRW`다. 예를 들어 100 USD는 16,000 JPY 또는 120,000 KRW이며 중간 반올림을 하지 않는다. **합성 수치는 실응답과 별개**다.

| 사례 | 고정 현재 시각(UTC) 또는 입력 | 기대 |
| --- | --- | --- |
| 주말 | 10-31 16:00Z, 금요일 세트 | `current` |
| 월요일 발표 직전 | 11-02 14:59:59Z | `current` |
| 월요일 발표 미갱신 | 11-02 15:00:00Z 및 21:00Z | `grace` |
| 화요일 발표 직전 | 11-03 14:59:59Z | `grace` |
| 화요일 발표에도 미갱신 | 11-03 15:00:00Z | `withheld` |
| 같은 금요일 값을 화요일 다시 수집 | 11-03 15:01Z, HTTP 200 | `withheld`; 수집시각만 갱신되어도 기한 불변 |
| 화요일에 늦은 월요일 전체 세트 | 11-03 15:02Z, `D=11-02` | `grace` |
| 화요일 새 전체 세트로 회복 | 11-03 15:03Z, `D=11-03` | `current` |
| 장기 미접속 후 첫 판정 | 11-16 09:00Z, 금요일 세트 | 즉시 `withheld`, 새 유예 없음 |
| 캐시 없음·KRW 빠진 부분 캐시 | 11-02 14:00Z | 즉시 `withheld`, 발표 실패를 기다리지 않음 |
| 429·10초 timeout·503 | 월요일 실패 후 화요일 경계까지 | 전체 캐시 보존, 월요일 `grace` → 화요일 `withheld` |
| 누락·중복·0·음수·NaN·Infinity·overflow·숫자 오류·날짜 혼합·불량 XML | 합성 응답 14종 | 기존 세트 불변; 기존 세트도 없으면 `withheld` |
| 더 과거의 응답 도착 | 화요일 세트 뒤 금요일 응답 | 화요일 세트 유지 |
| 성금요일·부활절 월요일 | `D=04-02`, 04-03·04-06 15:00Z | `current` |
| 부활절 이후 두 발표 실패 | 04-07·04-08 14:00Z | 화요일 `grace` → 수요일 `withheld` |
| 성탄절·주말 이후 두 발표 실패 | `D=12-24`, 12-25·27·28·29 | `current` → `current` → `grace` → `withheld` |
| 연말·신정 | `D=2026-12-31`, 2027-01-01 18:00Z·01-04 15:00Z | `current` → `grace` |
| 직원 휴일과 TARGET 휴일 구분 | 2026-05-14·12-24 / 2027-03-26·03-29 | 앞 두 날은 영업일, 뒤 두 날은 휴무일 |
| 서머타임 전환 전후 | 03-27·03-30·10-23·10-26 16:00 현지 | 15:00Z·14:00Z·14:00Z·15:00Z |
| 달력 검증 범위 밖 | 2028-01-03 16:00Z | `withheld` |

실소스 접근을 다시 관찰하려면 아래 무인증 GET을 별도로 실행한다. 날짜와 환율은 실행일에 따라 달라질 수 있다. 이것은 합성 실패 재현 명령이 아니다.

```sh
curl --fail --show-error --silent --max-time 10 \
  https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
```

## 후속 구현에 전달할 결과

#54의 완료 범위는 단일 ECB XML 공급 계약, 날짜·단위·전체 세트 검증, 공식 발표 달력, 한 발표 유예와 다음 발표 시 보류 사례다. #57은 이 계약의 실제 조회·캐시·SBI 손익 복귀를, #58은 통합 합계·표시 통화에 사용 가능 상태를 연결한다. 서버 재시작 뒤의 공유 캐시 보존, 배포 환경 GET, 실장애·실제 여름 게시 관찰은 이번 오프라인 사례 통과로 검증 완료가 되지 않는다.

## 실행 확인

2026-10-30 (Asia/Tokyo), Python 3.12.3·Node 22.21.0에서 확인했다.

- `python3 scripts/spikes/ecb_contract.py`: 실응답 fixture 확인과 합성 판정을 합쳐 93개 검증 통과.
- `npx next typegen` 후 `npx tsc --noEmit`: 통과. 깨끗한 설치에서 기존 `LayoutProps`를 먼저 생성해야 한다.
- `npm run lint`: 통과.
- `npm test`: 기존 전체 단위 테스트 12개 파일·119개 테스트 통과.
