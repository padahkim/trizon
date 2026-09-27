import type { Market } from "./model.ts";

export type SymbolCandidates =
  | { ok: true; code: string; candidates: string[] }
  | { ok: false; error: string };

/**
 * 사용자가 입력한 종목코드 → Yahoo 조회 심볼 후보 (앞에서부터 시도한다).
 * - KR: 6자리(KRX 는 영숫자 코드도 발급한다). HTS 식 "A005930" 도 받는다. KOSPI(.KS) → KOSDAQ(.KQ) 순.
 * - JP: 숫자 1자 + 영숫자 3자 (7203, 285A) → .T
 * - US: 클래스 주식의 "." 은 Yahoo 표기 "-" 로 (BRK.B → BRK-B)
 */
export function quoteSymbolCandidates(market: Market, rawCode: string): SymbolCandidates {
  const input = rawCode.trim().toUpperCase();
  if (input === "") return { ok: false, error: "종목코드를 입력하세요" };

  switch (market) {
    case "KR": {
      let code = input.replace(/\.(KS|KQ)$/, "");
      if (/^A[0-9A-Z]{6}$/.test(code)) code = code.slice(1);
      if (!/^[0-9A-Z]{6}$/.test(code)) {
        return { ok: false, error: "한국 종목코드는 6자리입니다 (예: 005930)" };
      }
      return { ok: true, code, candidates: [`${code}.KS`, `${code}.KQ`] };
    }
    case "JP": {
      const code = input.replace(/\.T$/, "");
      if (!/^\d[0-9A-Z]{3}$/.test(code)) {
        return { ok: false, error: "일본 종목코드는 4자리입니다 (예: 7203, 285A)" };
      }
      return { ok: true, code, candidates: [`${code}.T`] };
    }
    case "US": {
      if (!/^[A-Z][A-Z0-9]*([.-][A-Z0-9]+)?$/.test(input) || input.length > 10) {
        return { ok: false, error: "미국 티커 형식이 아닙니다 (예: AAPL, BRK.B)" };
      }
      return { ok: true, code: input, candidates: [input.replace(".", "-")] };
    }
  }
}
