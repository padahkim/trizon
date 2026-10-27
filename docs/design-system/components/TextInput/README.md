# TextInput

입력 필드는 3단계의 증권사 키 입력과 계좌 별칭처럼 짧은 값을 받습니다.

- 마크업: `<label class="tz-field"><span class="label">라벨</span><input class="tz-input body-md"><span class="tz-help caption">도움말</span></label>`.
- `surface-raised` 바탕, 1px `line-strong` 안쪽 테두리, `rounded-md`, 높이 40px(`spacing-sm` `spacing-md`).
- 플레이스홀더는 `ink-3`이며 예시만 적습니다. 꼭 필요한 정보는 라벨과 도움말에 둡니다.
- 오류는 `aria-invalid="true"`로 테두리를 `danger`로 바꾸고, `tz-help-error`에 무엇이 틀렸는지와 어떻게 고치는지를 씁니다(PRD U25). 틀린 키는 저장하지 않습니다.
- 키 필드는 `autocomplete="off"`, `spellcheck="false"`로 두고, 근처에 "키는 서버에 보관합니다"를 적습니다.
- 사용하는 쪽이 제공: 라벨, 값, 도움말·오류 문장, 발급 페이지 링크.
