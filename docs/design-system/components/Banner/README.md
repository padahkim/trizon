# Banner

배너는 화면 전체나 한 영역에 걸친 문제를 한 문장으로 알리고, 할 수 있는 동작이 있으면 옆에 둡니다.

- 마크업: `<div class="tz-banner tz-banner-warning">` 안에 20px 아이콘, `<p class="tz-banner-text body-sm">`, 선택적 작은 보조 버튼.
- **주의** `tz-banner-warning`: `warning-soft` 바탕, `warning` 아이콘. 숫자가 덜 정확한 상태(시세 전체 실패, 환율을 못 받음).
- **오류** `tz-banner-danger`: `danger-soft` 바탕, `danger` 아이콘, `role="alert"`. 사용자가 무언가를 잃을 수 있는 상태(저장 실패, 일시 정지된 DB).
- **중립** `tz-banner`: `surface-sunken` 바탕. 처리 결과 안내(건너뛴 거래·표 N개).
- 왼쪽 색 막대 대신 바탕 색과 아이콘으로 종류를 알립니다. 문장은 무엇이 일어났는지, 그래서 지금 무엇이 보이는지, 무엇을 하면 되는지 순서로 씁니다.
- 위치: 화면 전체 문제는 Summary 바로 위, 한 증권사·시장의 문제는 그 카드 안에 둡니다.
- 사용하는 쪽이 제공: 종류, 문장, 동작 버튼.
