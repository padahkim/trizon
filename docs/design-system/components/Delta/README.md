# Delta

Delta는 평가손익과 전일 대비를 보이는 숫자 한 묶음입니다. 방향은 색과 부호로 함께 알립니다.

- 마크업: `<span class="tz-delta tz-rise"><span class="body-sm">+¥2,000</span><span class="caption">+20.00%</span></span>`.
- 방향 클래스: 0보다 크면 `tz-rise`(빨강, `+`), 작으면 `tz-fall`(파랑, `-`), 0이면 `tz-flat`(부호 없음). 시세가 없어 0으로 둔 값도 `tz-flat`입니다.
- 크기는 놓이는 자리를 따릅니다: 맨 위 요약은 `figure-lg`, 소계는 `figure-md`, 표 안은 `body-sm`, 퍼센트는 한 단계 작게(`caption` 또는 `body-sm`).
- 강조 알약 `tz-pill`은 `rise-soft`·`fall-soft`·`surface-sunken` 배경입니다. 한 화면에 한두 번, 오늘 변동을 띄울 때만 씁니다.
- 숫자 형식은 README의 「숫자 표기」를 따릅니다. 퍼센트 계산(평가손익 ÷ 취득원가, 전일 대비 ÷ 전일 평가액)은 사용하는 쪽이 합니다.
- 사용하는 쪽이 제공: 부호가 붙은 문자열과 방향.
