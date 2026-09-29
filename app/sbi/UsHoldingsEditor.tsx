"use client";

import { useActionState, useState } from "react";
import type { SbiUsHolding } from "@/lib/sbi/types.ts";
import { saveSbiUsHoldings, type FormState } from "../actions.ts";
import styles from "./sbi.module.css";

type Draft = Omit<SbiUsHolding, "quantity" | "avgCost"> & { quantity: string; avgCost: string };

export type UsTradeSummary = {
  files: number;
  trades: number;
  duplicates: number;
  closed: number;
  period: string;
};

const INITIAL_STATE: FormState = { ok: false };

export function UsHoldingsEditor(props: {
  holdings: SbiUsHolding[];
  needsReview: boolean;
  warnings: string[];
  summary: UsTradeSummary;
}) {
  const { needsReview, warnings, summary } = props;
  const [rows, setRows] = useState<Draft[]>(() => props.holdings.map(toDraft));
  const [state, action, pending] = useActionState(saveSbiUsHoldings, INITIAL_STATE);

  const update = (id: string, patch: Partial<Draft>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const payload = rows.map((row) => ({ ...row, ticker: row.ticker.trim().toUpperCase(), quantity: Number(row.quantity), avgCost: Number(row.avgCost) }));

  return (
    <section className={`panel ${styles.usReview}`}>
      <div className={styles.reviewHead}>
        <div>
          <h2>현재 보유종목을 확인해주세요</h2>
          <p>
            SBI증권의 미국주식 약정이력 CSV는 최근 2년까지만 제공됩니다. 2년 이전부터 보유 중인 종목이 있다면 현재 보유정보를 추가하거나
            수정해주세요.
          </p>
        </div>
        <span className={needsReview ? "pill pill-warn" : "pill"}>{needsReview ? "확인 필요" : "확인 완료"}</span>
      </div>

      <dl className={styles.tradeStats}>
        <div>
          <dt>반영 기간</dt>
          <dd>{summary.period}</dd>
        </div>
        <div>
          <dt>CSV</dt>
          <dd>{summary.files}개</dd>
        </div>
        <div>
          <dt>고유 체결</dt>
          <dd>{summary.trades}건</dd>
        </div>
        <div>
          <dt>중복 제외</dt>
          <dd>{summary.duplicates}건</dd>
        </div>
        <div>
          <dt>잔고 0 제외</dt>
          <dd>{summary.closed}종목</dd>
        </div>
      </dl>

      {warnings.length > 0 && (
        <details className={styles.reviewWarnings} open={needsReview}>
          <summary>확인할 내용 {warnings.length}건</summary>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}

      <form action={action} className={styles.reviewForm}>
        <input type="hidden" name="holdings" value={JSON.stringify(payload)} />
        <div className={`table-wrap ${styles.editorWrap}`}>
          <table className={`data ${styles.editor}`}>
            <thead>
              <tr>
                <th>ticker</th>
                <th>종목명</th>
                <th className="r">현재 보유수량</th>
                <th className="r">평균 취득단가</th>
                <th>통화</th>
                <th>계좌구분</th>
                <th>삭제</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      aria-label="ticker"
                      value={row.ticker}
                      onChange={(event) => update(row.id, { ticker: event.target.value.toUpperCase() })}
                      required
                      spellCheck={false}
                    />
                    <span className="sub">{row.source === "inferred" ? "CSV 추정값" : "직접 추가"}</span>
                  </td>
                  <td>
                    <input aria-label={`${row.ticker || "새 종목"} 종목명`} value={row.name} onChange={(event) => update(row.id, { name: event.target.value })} required />
                  </td>
                  <td>
                    <input
                      className="num"
                      aria-label={`${row.ticker || "새 종목"} 현재 보유수량`}
                      type="number"
                      min="0.00000001"
                      step="any"
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(event) => update(row.id, { quantity: event.target.value })}
                      required
                    />
                  </td>
                  <td>
                    <input
                      className="num"
                      aria-label={`${row.ticker || "새 종목"} 평균 취득단가`}
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={row.avgCost}
                      onChange={(event) => update(row.id, { avgCost: event.target.value })}
                      required
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`${row.ticker || "새 종목"} 취득단가 통화`}
                      value={row.costCurrency}
                      onChange={(event) => update(row.id, { costCurrency: event.target.value as "USD" | "JPY" })}
                    >
                      <option value="USD">USD</option>
                      <option value="JPY">JPY</option>
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`${row.ticker || "새 종목"} 계좌구분`}
                      value={row.accountType}
                      onChange={(event) => update(row.id, { accountType: event.target.value })}
                      placeholder="特定 / NISA / 一般"
                      required
                    />
                  </td>
                  <td>
                    <button type="button" className="btn btn-danger-quiet" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.editorEmpty}>
                    CSV에서 현재 잔고가 추정되지 않았습니다. 오래전부터 보유 중인 종목이 있을 때만 추가하세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.reviewActions}>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  id: `sbi-us-manual:${crypto.randomUUID()}`,
                  ticker: "",
                  name: "",
                  quantity: "",
                  avgCost: "",
                  costCurrency: "USD",
                  accountType: "特定",
                  source: "manual",
                },
              ])
            }
          >
            + 보유종목 추가
          </button>
          <span className={styles.reviewRule}>2년 이전에 거래했고 지금도 잔고가 남은 종목만 추가하세요.</span>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "저장 중…" : "현재 보유정보 저장"}
          </button>
        </div>
        {state.message && (
          <p className={state.ok ? styles.formSuccess : "notice notice-danger"} role="status">
            {state.message}
          </p>
        )}
      </form>
      <p className={styles.estimateNote}>
        평균 취득단가는 이동평균 방식의 추정값입니다. 수수료·환율·세법상 계산, 같은 날의 매수/매도, 주식분할·합병·타사입고 때문에 SBI 화면과
        차이가 날 수 있습니다.
      </p>
    </section>
  );
}

function toDraft(row: SbiUsHolding): Draft {
  return { ...row, quantity: formatInput(row.quantity, 8), avgCost: formatInput(row.avgCost, 6) };
}

function formatInput(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)));
}
