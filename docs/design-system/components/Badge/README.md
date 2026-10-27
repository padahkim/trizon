# Badge

배지는 숫자나 증권사 옆에 붙어, 그 숫자를 읽기 전에 알아야 할 상태를 한두 단어로 알립니다.

- **중립** `tz-badge badge`: `surface-sunken`에 `ink-2`. "현금 제외", "지원 안 됨", "받는 중".
- **주의** `tz-badge tz-badge-warning`: `warning-soft`에 `warning-text`. "시세 없음", "환차손익 빠짐", "約定履歴으로 추정한 값". 숫자를 그대로 믿으면 안 될 때 씁니다.
- **오류** `tz-badge tz-badge-danger`: `danger-soft`에 `danger`. "동기화 실패", "읽지 못함".
- **정상** `tz-badge tz-badge-ok`: `ok-soft`에 `ok`. "연결됨", "반영됨".
- **계좌구분** `tz-badge tz-badge-outline`: 1px `line-strong` 테두리. 特定·NISA처럼 같은 종목을 나누는 꼬리표에 씁니다. `lang="ja"`.
- 앞에 `tz-dot`(상태 점)이나 16px 아이콘을 붙일 수 있습니다. 색만으로 구분하지 않도록 단어는 빼지 않습니다.
- 사용하는 쪽이 제공: 라벨과 종류.
