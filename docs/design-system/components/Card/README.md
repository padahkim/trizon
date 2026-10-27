# Card

카드는 `surface` 바탕 위에 놓이는 흰 표면이며, 그림자 없이 바탕과의 대비로 떠 보입니다.

- `tz-card`: `surface-raised`, `rounded-xl`, 안쪽 `spacing-xl`. 머리는 `tz-card-head`(제목 `title-md`, 설명 `body-sm` `ink-2`, 오른쪽에 동작).
- `tz-inset`: 카드 안의 회색 영역(`surface`, `rounded-lg`, `spacing-lg`). 이름–값 목록 `tz-kv`나 보조 정보를 묶습니다.
- 카드를 카드 안에 넣지 않습니다. 카드 안은 구분선(`line`)과 인셋으로 나눕니다.
- `Summary`, `BrokerCard`, `Dialog`가 이 표면을 씁니다.
- 사용하는 쪽이 제공: 제목, 내용, 동작.
