import type { Market } from "../domain/model.ts";

/** 종목 검색용 목록의 한 줄 */
export type SymbolEntry = {
  market: Market;
  /** 폼에 넣는 코드 그대로 (005930 / 7203 / BRK.B) */
  code: string;
  /** 표시·저장용 이름 — 한국: 한글명, 일본: 日本語名, 미국: 한글명 (없으면 영문명) */
  name: string;
  /** 검색에만 쓰는 다른 이름 (일본 종목의 한글명·영문명, 미국 종목의 영문명) */
  aliases: string[];
  /** 코스피 / 코스닥 / 도쿄 / 나스닥 / 뉴욕 / 아멕스 */
  exchange: string;
  /** ETF · ETN · 리츠 (보통주는 비운다) */
  kind?: string;
  /** 회사 규모 1(초대형)~4(소형) — 검색 순위가 같을 때 큰 회사를 먼저 보여 준다. 모르면 비운다 (미국 전부) */
  tier?: 1 | 2 | 3 | 4;
};

export type SymbolIndexFile = {
  version: 1;
  /** 목록을 받은 시각 (ISO) */
  fetchedAt: string;
  /** 일부 소스를 못 받았을 때의 사유 (예: JPX 실패 → 일본어 종목명 없음) */
  warnings: string[];
  entries: SymbolEntry[];
};
