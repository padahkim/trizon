"use client";

import { useId, useState } from "react";
import styles from "./sbi.module.css";

/**
 * 표 한 줄 + 펼치면 바로 아래에 나오는 상세 줄. 첫 칸의 이름 옆에 토글 버튼을 둔다.
 * 상세 내용(children)은 서버에서 그려서 넘긴다.
 */
export function ExpandRow(props: {
  /** 첫 칸 (이름 등) */
  head: React.ReactNode;
  /** 나머지 칸들 (<td> 여러 개) */
  cells: React.ReactNode;
  colSpan: number;
  toggleLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <tr className={styles.expandHead} data-open={open || undefined}>
        <td>
          <div className={styles.expandCell}>
            <div className={styles.expandName}>{props.head}</div>
            <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
              {props.toggleLabel}
              <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
                <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </td>
        {props.cells}
      </tr>
      {open && (
        <tr id={id} className={styles.expandBody}>
          <td colSpan={props.colSpan}>{props.children}</td>
        </tr>
      )}
    </>
  );
}
