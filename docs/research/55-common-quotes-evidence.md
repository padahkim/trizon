# #55 공통 시세: 공식 출처와 검증 한계

확인일: **2026-10-30 (Asia/Tokyo)**. [이슈 #55](https://github.com/padahkim/trizon/issues/55)의 출처 조사다. 제품 계약과 합성 예시는 별도 계약 문서를 따른다. 실제 공급자 관찰은 [관찰 기록](55-quote-observations.md)과 구분한다. 가격 원문·마스터 전체·개인 계좌 자료를 fixture로 복제하지 않는다.

「확인」은 아래 출처에 해당 설명이 있다는 뜻이다. 공개 웹 문서 확인, 라이브 응답 관찰, 배포·재배포 권한 확보는 각각 별개다. 검색 도구의 공식 페이지 색인으로 읽은 Yahoo Help 일부는 직접 열면 HTTP 429, NXT 일부는 HTTP 403이어서 전체 약관 검토를 완료했다고 보지 않는다.

## 시장 분류와 거래 장소

| 출처 | 확인한 사실 | 제품에 적용할 판단 |
|---|---|---|
| [KRX 상장회사 검색](https://global.krx.co.kr/contents/GLB/03/0308/0308010000/GLB0308010000.jsp), [KRX 규정 목록](https://global.krx.co.kr/contents/GLB/06/0601/0601000000/GLB0601000000.jsp) | KOSPI·KOSDAQ·KONEX를 각각 구별한다. 영문 규정은 참고 번역이며 갱신 차이 등이 있으면 한국어가 우선한다. | `KR`(국가/거래시장), `KOSPI/KOSDAQ/KONEX`(상장시장 분류), `KRX/NXT`(체결 장소)를 하나의 enum으로 섞지 않는다. |
| [NXT 시장 소개](https://www.nextrade.co.kr/en/marketOverview/content.do) | NXT는 KRX와 병존하는 ATS이며 KRX에 상장된 동일 주식을 거래한다. | NXT 체결 때문에 보유 종목 식별자를 별개 종목으로 만들지 않는다. 상장시장과 시세의 체결 장소는 별도 메타데이터다. |
| [NXT 매매제도](https://nextrade.co.kr/en/transactionSys/content.do) | 정규시장의 pre/main/after 구분과 별도 종가매매시장이 있다. 종가매매는 KRX의 당일 종가로 거래한다. KOSPI/KOSDAQ 상장 종목이어도 거래대상 선정·세션이 따로 있다. | `NXT`라는 정보만으로 `.KS`·`.KQ`를 고르거나 모든 한국 종목의 NXT 지원을 추론하지 않는다. |

공개 마스터는 [한국투자증권 공식 KOSPI 마스터 예제](https://github.com/koreainvestment/open-trading-api/blob/main/stocks_info/kis_kospi_code_mst.py), [공식 KOSDAQ 마스터 예제](https://github.com/koreainvestment/open-trading-api/blob/main/stocks_info/kis_kosdaq_code_mst.py), [공식 종목정보 디렉토리](https://github.com/koreainvestment/open-trading-api/tree/main/stocks_info)에서 확인했다. 두 예제는 CP949 텍스트를 읽고 단축코드(앞 9자), 표준코드(다음 12자), 한글명을 분리한다. 이 사실은 모든 증권사 잔고 코드가 9자리라는 뜻이 아니다. 증권사별 코드 접두사·채움 규칙을 확인하기 전 숫자 변환, 임의 절단, 임의 `padStart`를 하지 않는다. 이 공개 마스터 확인으로 한국투자증권을 제품의 새 증권사/시세 공급자로 도입하지 않는다.

### 공개 마스터의 두 종목 대조 관찰

위 공식 예제가 가리키는 공개 ZIP을 TLS 인증서 검증을 켠 `curl`로 `/tmp/trizon55-master-evidence/`에만 받았다. API 키·계좌 조회는 사용하지 않았다. ZIP을 메모리에서 읽어 CP949로 해석하고 단축코드는 문자열의 오른쪽 공백만 제거했다. 아래 이름은 21바이트 다음의 40바이트 필드를 CP949로 해석한 공개 식별정보다. 원본 전체는 저장소나 합성 fixture에 넣지 않았다.

| 출처 ZIP | 수신 완료 UTC → JST | 공개 원본 단축코드 → 문자열 | 표준코드 / 이름 | 해당 마스터 대조 |
|---|---|---|---|---|
| [KOSPI](https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip) | `2026-10-29T18:09:01Z` → `2026-10-30T03:09:01+09:00` | `"005930   "` → `"005930"` | `KR7005930003` / 삼성전자 | `kospi_code.mst` 2,586행 중 1행 일치. `035900`은 0행. |
| [KOSDAQ](https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip) | `2026-10-29T18:09:03Z` → `2026-10-30T03:09:03+09:00` | `"035900   "` → `"035900"` | `KR7035900000` / JYP Ent. | `kosdaq_code.mst` 1,826행 중 1행 일치. `005930`은 0행. |

두 ZIP의 SHA-256(수신된 압축 파일 바이트 기준):

- KOSPI: `d30bd337e71c8b3baf5a026950397ef2a951bf73981416a24fc906d010137b1d`
- KOSDAQ: `66f472f547c746abec6dcb6b8afbc23ba10ddeaa335303b7e96ac596a0485ee8`

**관찰 범위:** 두 공개 종목에 한해 KOSPI/KOSDAQ와 선행 0 보존을 대조했다. 수신시각은 공급자의 master 유효시각이나 시세 `marketTime`이 아니다. 파일의 전체 최신성, 공식 KRX 원본과의 전수 일치, 시장 이전 이력, 다른 종목·KONEX·NXT 거래대상·Yahoo의 체결 장소를 증명하지 않는다. 특히 이 결과는 KB/NH/토스 응답을 관찰한 증거가 아니며 후속 증권사 spike의 master/코드 대조를 대신하지 않는다.

종목코드 `005930`와 계좌 식별자 `00123456`는 문자열로 운반해야 한다. 이는 선행 0 보존을 위한 제품 계약이다. 계좌번호의 길이·부분번호 의미는 해당 증권사 spike에서 확인하며, 이 예시는 실제 계좌번호가 아니다.

## Yahoo 및 라이브러리 필드

Yahoo의 공개 Help는 거래소별 접미사와 지연을 제공한다. [공식 공급자 목록](https://help.yahoo.com/kb/SLN2352.html)의 Korea Stock Exchange는 `.KS`, KOSDAQ는 `.KQ`이며 각각 20분 지연으로 기재되어 있다. [동일 공식 Help의 거래소 표](https://help.yahoo.com/kb/finance-for-web/SLN2310.html?locale=it_IT)는 Tokyo `.T`도 20분 지연으로 기재한다. 이는 목록의 일반 설명이며 특정 응답이 반드시 20분 오래되었다는 검증값은 아니다. KONEX·NXT 전용 접미사나 NXT/통합시세 포함 여부는 이 표에서 확인하지 못했다.

아래 의미는 Yahoo의 보증된 API 규격이 아니라 [yahoo-finance2 상위 프로젝트의 `quote.ts`](https://github.com/gadicc/yahoo-finance2/blob/dev/src/modules/quote.ts)에 적힌 타입·주석이다. `dev` 문서는 변할 수 있으므로 실제 설치 버전의 동작은 관찰 기록과 현재 저장소 코드로 다시 확인한다.

| 필드 | 상위 프로젝트에 있는 설명/타입 | 해석의 경계 |
|---|---|---|
| `regularMarketPrice` | 정규장 현재/마지막 가격, optional number | 시간외 최신 체결가와 같다고 보지 않는다. |
| `regularMarketPreviousClose` | 전일 종가, optional number | 전일의 달력 날짜, 분할·배당 조정 규칙을 이 이름만으로 확정하지 않는다. |
| `regularMarketTime` | 정규장 timestamp, optional `Date` | 수신시각으로 대체하지 않는다. ISO UTC로 직렬화해도 거래일은 거래소 TZ로 해석한다. |
| `currency` | optional string | 없는 경우 계좌통화로 채우지 않는다. 거래통화와 재무보고용 `financialCurrency`도 구별한다. |
| `exchangeTimezoneName` | 거래소 TZ 이름 | `America/New_York` 같은 IANA TZ를 써야 DST를 보존한다. |
| `marketState` | `REGULAR/CLOSED/PRE/PREPRE/POST/POSTPOST` | 응답 시점의 상태와 마지막 정규장 가격의 세션을 구별한다. |
| pre/post market 가격·시각 | 정규장과 별도 필드 | 가격만 시간외 값으로 바꾸고 정규장 시각/전일종가와 결합하지 않는다. |

optional은 필드가 빠질 수 있다는 라이브러리 계약이다. 공급자 원문 `null`, 누락, 잘못된 값의 빈도·차이는 전 시장에서 관찰하지 않았다. 숫자 0을 「미상」으로 변환하는 규칙도 이 출처에 없다. 현재 앱의 엄격한 스키마가 거부하는 값과 장래 정규화 계약의 `null` 의미를 분리해야 한다. [상위 README](https://github.com/gadicc/yahoo-finance2)는 라이브러리를 **비공식 API**로 설명한다. 구현이 가능하다는 사실이 Yahoo의 호출 보장이나 이용 권한을 뜻하지 않는다.

## 거래일·휴일·시간외

| 공식 자료 | 확인 내용 | 오늘 변동에 미치는 판단 |
|---|---|---|
| [JPX 거래시간](https://www.jpx.co.jp/english/equities/trading/domestic/01.html) | 도쿄 정규장은 09:00–11:30, 12:30–15:30. 주말·공휴일·1/1–1/3·12/31은 휴장이다. | 점심 휴장/주말에 새 정규장 가격이 없더라도 수신시각을 붙여 최신 체결처럼 만들지 않는다. |
| [NYSE 거래시간·휴장일](https://www.nyse.com/trade/hours-calendars) | 정규장 09:30–16:00 Eastern. 휴장과 조기 폐장이 별도로 있다. | 날짜 경계와 DST 때문에 JST/KST의 「오늘」을 미국 거래일로 쓰면 안 된다. |
| [KRX KOSPI 거래시간](https://global.krx.co.kr/contents/GLB/06/0602/0602010201/GLB0602010201T1.jsp), [KOSDAQ 거래시간](https://global.krx.co.kr/contents/GLB/06/0602/0602020204/GLB0602020204T1.jsp) | 현재 페이지에는 정규장 09:00–15:30과 after-market 16:00–20:00이 구별되어 있다. 휴일/연말 휴장이 있다. | 예전 16:00–18:00 시간외 설명을 고정하지 않는다. 한국 시세도 정규장/시간외 필드와 거래일 검증이 필요하다. |
| [NXT 매매제도](https://nextrade.co.kr/en/transactionSys/content.do) | KST(UTC+9) 기준 pre 08:00–08:50, main 09:00:30–15:20, after 체결 15:40–20:00, 별도 KRX 종가매매 15:30–16:00. 연초·수능일 시간 변경도 있다. | 공급자 시각의 venue/session을 검증하고, NXT after-market 가격을 KRX 정규장 가격이라고 표기하지 않는다. |

**계약 판단:** PRD U9/U10의 「오늘 변동」은 현재 보유수량 × (채택한 현재가 − 그 시세에 대응하는 전일종가)다. 휴일에 달력상 어제 일봉을 찾거나 마지막 일봉 두 개를 무조건 빼면 세션 기준이 달라진다. 휴장일에는 마지막 시세의 실제 날짜를 유지한다. 위 거래소 시간표는 의미를 설명하는 근거이고 영구적인 앱용 거래일 캘린더는 아니다.

## 분할과 일봉 대안

- [Yahoo 공식 역사 시세 표](https://finance.yahoo.com/quote/AAPL/history/)는 Close를 분할 조정 가격, Adj Close를 분할과 배당/자본이득 분배 조정 가격으로 설명한다. [Yahoo adjusted close 설명](https://in.help.yahoo.com/kb/adjusted-close-sln28256.html)도 분할·배당 조정을 포함한다고 설명한다. **따라서 Adj Close를 단순 전일종가 대안으로 사용하면 배당 효과가 섞일 수 있다.** 이는 실제 응답 모든 필드의 조정 일관성을 보장하지 않는다.
- [KRX 기준가격 설명](https://regulation.krx.co.kr/contents/RGL/03/03010100/RGL03010100T6.jsp)은 일반적으로 전일종가를 쓰되 분할·병합·증자 등에서 이론가격으로 조정한다고 설명한다. 기준가격을 무조건 원시 전일종가와 동의어로 매핑하면 안 된다.
- [JPX 자기주식 취득 Q&A](https://www.jpx.co.jp/english/equities/trading/own-company-shares/tvdivq0000006haj-att/en.pdf)는 분할/배당락에 따른 기준가격 조정을 예시한다. 이 규정의 기준가격이 곧 Yahoo `regularMarketPreviousClose`라는 연결은 확인되지 않았다.
- [상위 `chart.ts`](https://github.com/gadicc/yahoo-finance2/blob/dev/src/modules/chart.ts)는 `timestamp`를 `Date`로 변환하고 OHLC `close`, 별도 `adjclose`, 분할·배당 이벤트를 반환한다. **일봉 timestamp를 실제 마지막 체결시각으로 해석하는 근거는 없다.** 일봉을 추가 대안으로 켜려면 거래일/완성된 bar/가격 조정기준/현재 보유수량 기준이 모두 맞는지 별도 관찰해야 한다.

**채택 판단:** 이 spike는 일봉 자동 대체나 보유수량의 분할 자동 보정을 도입하지 않는다. 전일종가와 현재가의 주당 기준이 확인되지 않으면 오늘 변동은 미측정(계산 기여 0)으로 남긴다. 분할 후 현재 보유가 이미 보정되어 있는데 과거 종가를 다시 중복 조정하지 않도록 한다.

## 지원·이용조건 매트릭스

| 경로 | 조사로 확인된 범위 | 이용조건 및 아직 검증되지 않은 것 |
|---|---|---|
| 현재 Yahoo JP/US | 앱의 현행 경로. `.T`, 미국 ticker 변환은 코드 감사, 실제 필드는 별도 관찰 기록 참조 | 비공식 API의 안정성·할당량 보장 없음. 상장폐지/거래정지/분할 전후 전체 검증 아님. |
| Yahoo KR | 공식 `.KS/.KQ` 표와 개별 공개 종목 관찰 | 앱 지원 추가는 별도 구현. KONEX/NXT/통합시세 provenance·종목 전체 지원·nullable 의미는 미확인. |
| KRX OPEN API | [통계정보 API 소개](https://openapi.krx.co.kr/contents/OPP/INFO/OPPINFO001.jsp), [이용 절차](https://openapi.krx.co.kr/contents/OPP/INFO/OPPINFO003.jsp) | 가입·인증키 승인 및 API 활용 승인 필요. 키를 신청하거나 호출하지 않았다. [정보 수신방법](https://openapi.krx.co.kr/contents/OPP/DATA/OPPDATA003.jsp)은 실시간/지연 정보 이용계약 경로를 별도로 설명한다. 통계 API를 실시간 시세로 간주하지 않는다. |
| 금융위/공공데이터 주식시세 | [공식 카탈로그](https://www.data.go.kr/catalog/15094808/openapi.json)는 일 1회, 기준일 다음 영업일 오후 1시 이후 갱신이라고 명시 | 소개문 일부의 「실시간」보다 구체적 갱신 안내를 따른다. 공공누리 4유형과 제3자 무단 제공·재배포 금지 안내가 있다. 라이브 현재가 대안으로 채택하지 않았다. |
| SBI 일본 CSV | 현행 업로드 경로의 보유별 現在値 | 공급자 공통 시세가 아니며 계좌별 snapshot이다. 공개 API의 실제 marketTime 증거가 아니다. |
| KB/NH/토스의 시세·잔고 API | 이번 조사에서 인증 호출 없음 | 해당 증권사 spike의 마스킹된 관찰만 후속 입력으로 받는다. 세 증권사의 검증 완료를 이 spike의 조건으로 묶지 않는다. |

[Yahoo 공식 공급자 목록](https://help.yahoo.com/kb/SLN2352.html)은 표시/제공된 정보의 재배포를 금지하고 정보 목적 사용을 명시한다. 공개 접근·키 없음·라이브 조회 성공·라이브러리 라이선스는 시세 데이터의 재배포 허가가 아니다. **이 문서는 새 다중 사용자 배포, 장기 저장/캐시, 제3자 재제공 권한을 승인하지 않는다.** 후속 구현이 현행 이용 조건을 변경하거나 별도 계약/비용을 요구하면 이슈의 결정 절차를 다시 연다. 여기에는 실제 공급자 가격의 복제 대신 합성 fixture를 사용한다.

## 증권사/시장 추가 때 필요한 관찰

1. **식별:** 원본 코드와 공식 master의 단축코드/표준코드/상장시장/거래통화/유효일을 대조한다. 선행 0·우선주·ETF 등 상품종류·시장 이전·폐지·ticker 변경을 확인한다. 코드 모양만으로 KOSPI/KOSDAQ를 추론하지 않는다.
2. **장소:** 잔고의 상장시장과 체결 장소(KRX/NXT/통합)를 분리한다. SOR 코드나 공급자 전용 코드의 의미, NXT 대상 여부와 시세 통합 범위를 확인한다.
3. **가격:** 현재가/전일종가/기준가/계좌 평가액을 각각 식별한다. 문자열 숫자의 빈 문자열·`null`·누락·0·부호 의미를 마스킹된 응답과 공식 규격으로 대조한다. broker 평가액÷수량을 공통 종목 가격으로 만들지 않는다.
4. **시각:** 가격에 대응하는 실제 날짜+시간+TZ+세션을 확인한다. `HHmmss`만 있는 응답, 수신시각만 있는 응답은 날짜를 추측하지 않는다. 휴일/장중/시간외/거래정지와 DST 전후 관찰을 남긴다.
5. **비교:** 동일 종목·동일 시간대의 정규장 종가와 공급자 전일종가를 대조한다. 분할·병합·배당락에서 조정기준 및 보유수량 단위를 확인한 후에만 오늘 변동에 사용한다. 일봉 대안은 별도 승인된 변경으로 다룬다.
6. **권한:** API 사용 주체/계좌 범위/보유 여부에 따른 권한, 호출 한도, 재사용·저장·표시·재배포 조건을 확인한다. 키가 필요한 검증은 해당 증권사 spike로 남긴다.

공통 fallback·미측정 상태는 제품 계약으로 고정할 수 있지만, 위 미확인 공급자 사실을 합성 fixture로 검증 완료 처리해서는 안 된다.
