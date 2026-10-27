# Button

버튼은 알약 모양이고, 주요 버튼만 브랜드 초록 `brand`로 채웁니다.

- **주요** `tz-btn tz-btn-primary button-md`: `brand` 채움, `on-brand` 라벨, 호버 `brand-hover`. 한 영역에 하나만 씁니다(예: 「CSV 고르기」).
- **보조** `tz-btn tz-btn-secondary button-md`: `surface-raised` 채움과 1px `line-strong` 안쪽 테두리. 「시세 새로고침」, 「CSV 올리기」, 「다시 연결」처럼 자주 쓰지만 화면의 주인공은 아닌 동작에 씁니다.
- **고스트** `tz-btn tz-btn-ghost`: 배경 없음, 호버 `surface-sunken`. 「취소」, 카드 안의 「동기화」.
- **위험** `tz-btn tz-btn-danger`: `danger` 채움. 확인 다이얼로그 안의 「데이터 지우기」, 「연결 해제」에만 씁니다. 첫 클릭은 보조 버튼으로 받고, 위험 버튼은 확인 단계에서만 씁니다.
- 크기: 기본 40px(`spacing-sm` `spacing-lg`, `button-md`), 작게 32px(`tz-btn-sm`, `button-sm`). 아이콘 버튼 `tz-btn-icon`은 24px 아이콘을 넣어 40px 원형으로 만듭니다.
- 비활성(`disabled`)은 `surface-sunken`에 `ink-3` 라벨입니다. 시세를 받는 동안 「시세 새로고침」을 「받는 중」으로 바꿔 비활성으로 둡니다.
- 사용하는 쪽이 제공: 라벨(하는 일), `type`, 아이콘 버튼의 `aria-label`.
