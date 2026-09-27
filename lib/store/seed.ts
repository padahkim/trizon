import type { PortfolioFile } from "../domain/schema.ts";

/** 첫 실행 때 만드는 계좌 4개. 계좌는 데이터라서 /holdings 에서 더 추가할 수 있다 (NISA·ISA 등). */
export function seedPortfolio(): PortfolioFile {
  return {
    version: 1,
    accounts: [
      { id: "kb", broker: "KB", label: "KB증권", homeCurrency: "KRW" },
      { id: "nh", broker: "NH", label: "NH투자증권(나무)", homeCurrency: "KRW" },
      { id: "toss", broker: "TOSS", label: "토스증권", homeCurrency: "KRW" },
      { id: "sbi", broker: "SBI", label: "SBI証券", homeCurrency: "JPY" },
    ],
    holdings: [],
  };
}
