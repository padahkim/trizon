import type { PortfolioFile } from "../domain/schema.ts";

/**
 * 포트폴리오 저장소. 문서 전체를 읽고 쓰는 거친 단위의 인터페이스라서
 * 나중에 DB 로 옮길 때도 이 두 메서드만 구현하면 된다.
 */
export interface PortfolioStore {
  load(): Promise<PortfolioFile>;
  /** 쓰기는 한 번에 하나씩 처리된다. mutator 결과는 스키마 검증을 통과해야 저장된다. */
  update(mutator: (current: PortfolioFile) => PortfolioFile): Promise<PortfolioFile>;
}

/** 저장 파일이 깨졌을 때. 파일은 건드리지 않고 그대로 둔다. */
export class PortfolioFileError extends Error {
  readonly filePath: string;
  readonly details: string[];
  constructor(filePath: string, message: string, details: string[] = []) {
    super(message);
    this.name = "PortfolioFileError";
    this.filePath = filePath;
    this.details = details;
  }
}
