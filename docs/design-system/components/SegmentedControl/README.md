# SegmentedControl

세그먼트는 서너 개의 배타적인 보기 중 하나를 고릅니다. 3단계에서 표시 통화(원·엔·달러)를 바꾸는 데 씁니다.

- 마크업: `role="radiogroup"` 안에 `<label><input type="radio"><span class="button-sm">₩ 원</span></label>`을 둡니다. 라디오는 보이지 않게 덮어 키보드 화살표로 바꿀 수 있습니다.
- 트랙은 `surface-sunken`, 선택은 `brand` 채움에 `on-brand` 라벨입니다.
- 높이는 40px로 버튼과 같습니다(트랙 `spacing-xs` + 세그먼트 32px).
- 통화를 바꾸면 금액만 바뀌고 퍼센트는 그대로입니다. 고른 값은 기억합니다(PRD U31).
- 사용하는 쪽이 제공: 그룹 라벨, 선택지, 현재 값, 변경 처리.
