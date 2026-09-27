import type { PortfolioFileError } from "@/lib/store/types.ts";

/** 저장 파일이 깨졌을 때. 파일은 그대로 두고, 무엇이 문제인지 보여준다. */
export function FileErrorPanel({ error }: { error: PortfolioFileError }) {
  return (
    <div className="panel notice-danger">
      <h2>저장 파일을 읽을 수 없습니다</h2>
      <p>
        {error.message}. 파일은 건드리지 않았습니다. 아래 내용을 보고 <code>{error.filePath}</code> 를 고친 뒤 새로고침하세요.
      </p>
      {error.details.length > 0 && (
        <ul>
          {error.details.slice(0, 20).map((d) => (
            <li key={d}>
              <code>{d}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
