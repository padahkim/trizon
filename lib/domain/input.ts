// 폼 입력 문자열 → 숫자. 서버 스키마(schema.ts)와 클라이언트 폼이 같은 규칙으로 읽도록 여기 한 곳에 둔다.
// zod 를 import 하지 않으므로 클라이언트 컴포넌트에서도 쓴다.

/** 증권사 화면에서 복사한 "1,234,567" / " 12.5 " → 숫자. 콤마·공백을 지우고, 빈 칸은 undefined, 숫자가 아니면 NaN */
export function parseNumberInput(text: string): number | undefined {
  const s = text.replace(/[,\s]/g, "");
  return s === "" ? undefined : Number(s);
}
