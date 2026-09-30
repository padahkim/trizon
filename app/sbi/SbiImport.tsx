"use client";

import { startTransition, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { SBI_GUIDE, type SbiGuide } from "@/lib/sbi/guide.ts";
import type { SbiImportKind } from "@/lib/sbi/types.ts";
import { clearSbiImport, importSbiCsv, type SbiImportResult } from "../actions.ts";
import { ConfirmSubmit } from "../_components/ConfirmSubmit.tsx";
import styles from "./sbi.module.css";

/** 서버가 만들어 주는 카드 내용. loaded 가 없으면 아직 넣지 않은 CSV */
export type ImportCardView = {
  kind: SbiImportKind;
  loaded: null | {
    headline: string;
    headlineClass: string;
    lines: string[];
    warnings: string[];
    /** 저장해 둔 CSV 를 지금 파서가 읽지 못할 때 */
    error?: string;
  };
};

const CLEAR_MESSAGE: Record<SbiImportKind, string> = {
  realized: "실현손익 CSV를 지울까요?",
  portfolio: "평가손익(ポートフォリオ) CSV를 지울까요? 대시보드의 SBI 보유종목도 함께 빠집니다.",
  usTrades: "미국주식 약정이력 CSV와 확인·수정한 미국주식 보유정보를 모두 지울까요?",
  dividends: "배당·분배금 CSV를 지울까요?",
};

/**
 * SBI CSV를 넣는 카드. 화면 어디에 떨궈도 받고, 종류는 서버가 내용으로 가린다
 * (카드를 잘못 골라 떨궈도 맞는 칸에 들어간다).
 */
export function SbiImport({ cards }: { cards: ImportCardView[] }) {
  const [pending, startUpload] = useTransition();
  const [results, setResults] = useState<SbiImportResult[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<SbiImportKind | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  const upload = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const form = new FormData();
    for (const f of files) {
      form.append("files", f);
      form.append("lastModified", String(f.lastModified));
    }
    startUpload(async () => {
      let next: SbiImportResult[];
      try {
        next = await importSbiCsv(form);
      } catch (err) {
        next = [{ fileName: files.map((f) => f.name).join(", "), ok: false, message: `올리지 못했습니다: ${err instanceof Error ? err.message : String(err)}`, warnings: [] }];
      }
      // await 뒤의 상태 변경은 transition 에 다시 넣어야 한다
      startTransition(() => setResults(next));
    });
  }, []);

  // 화면 어디에 떨궈도 받는다. 브라우저가 파일을 새 탭으로 여는 기본 동작도 막는다
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const reset = () => {
      depth.current = 0;
      setDragging(false);
      setHover(null);
    };
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) reset();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      reset();
      upload([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [upload]);

  const pick = () => inputRef.current?.click();
  const fresh = new Set(results?.filter((r) => r.ok).map((r) => r.kind));

  return (
    <div className={styles.importArea} data-dragging={dragging || undefined}>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        multiple
        hidden
        onChange={(e) => {
          upload([...(e.currentTarget.files ?? [])]);
          e.currentTarget.value = "";
        }}
      />

      {dragging && (
        <div className={styles.dropOverlay} aria-hidden>
          <div className={styles.dropOverlayCard}>
            <UploadIcon />
            <strong>놓으면 바로 읽어요</strong>
            <span>여러 파일을 한꺼번에 놓아도 종류를 알아서 나눠 담아요</span>
          </div>
        </div>
      )}

      {(pending || results) && (
        <div className={styles.results} aria-live="polite">
          {pending ? (
            <p className={styles.resultPending}>
              <span className={styles.spinner} aria-hidden /> CSV를 읽는 중…
            </p>
          ) : (
            <>
              <ul>
                {results?.map((r, i) => (
                  <li key={`${r.fileName}-${i}`} data-ok={r.ok}>
                    <span className={styles.resultIcon} aria-hidden>
                      {r.ok ? "✓" : "!"}
                    </span>
                    <span>
                      <strong>{r.fileName}</strong> — {r.message}
                      {r.warnings.length > 0 && (
                        <span className={styles.resultWarnings}>
                          {r.warnings.map((w) => (
                            <span key={w}>{w}</span>
                          ))}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-quiet" onClick={() => setResults(null)}>
                닫기
              </button>
            </>
          )}
        </div>
      )}

      <div className={styles.cards}>
        {cards.map((card) => (
          <Card
            key={card.kind}
            card={card}
            guide={SBI_GUIDE[card.kind]}
            hover={hover === card.kind}
            fresh={fresh.has(card.kind)}
            pending={pending}
            onPick={pick}
            onHover={(on) => setHover(on ? card.kind : null)}
          />
        ))}
      </div>
    </div>
  );
}

function Card(props: {
  card: ImportCardView;
  guide: SbiGuide;
  hover: boolean;
  fresh: boolean;
  pending: boolean;
  onPick: () => void;
  onHover: (on: boolean) => void;
}) {
  const { card, guide, hover, fresh, pending, onPick, onHover } = props;
  const loaded = card.loaded;
  return (
    <article
      className={styles.card}
      data-kind={card.kind}
      data-loaded={loaded && !loaded.error ? true : undefined}
      data-hover={hover || undefined}
      data-fresh={fresh || undefined}
      onDragEnter={() => onHover(true)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHover(false);
      }}
    >
      <header className={styles.cardHead}>
        <span className={styles.step}>{guide.step}</span>
        <div className={styles.cardTitle}>
          <h3>{guide.title}</h3>
          <span className={styles.jp}>{guide.jpTitle}</span>
        </div>
        {loaded && !loaded.error && <span className={styles.done}>✓ 반영됨</span>}
      </header>
      <p className={styles.meaning}>{guide.meaning}</p>

      {loaded ? (
        <>
          {loaded.error ? (
            <p className="notice notice-danger">{loaded.error}</p>
          ) : (
            <p className={`${styles.headline} num ${loaded.headlineClass}`}>{loaded.headline}</p>
          )}
          <ul className={styles.metaLines}>
            {loaded.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {loaded.warnings.length > 0 && (
            <ul className={styles.cardWarnings}>
              {loaded.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className={styles.cardActions}>
            <button type="button" className="btn" onClick={onPick} disabled={pending}>
              새 CSV 넣기
            </button>
            <form action={clearSbiImport}>
              <input type="hidden" name="kind" value={card.kind} />
              <ConfirmSubmit message={CLEAR_MESSAGE[card.kind]}>지우기</ConfirmSubmit>
            </form>
          </div>
          <details className={styles.again}>
            <summary>받는 방법 · 뜻 다시 보기</summary>
            <p className={styles.detail}>{guide.detail}</p>
            <HowTo guide={guide} />
          </details>
        </>
      ) : (
        <>
          <p className={styles.detail}>{guide.detail}</p>
          <HowTo guide={guide} />
          <button type="button" className={styles.dropZone} onClick={onPick} disabled={pending}>
            <UploadIcon />
            <strong>CSV를 여기에 끌어다 놓기</strong>
            <span>또는 눌러서 파일 고르기</span>
          </button>
        </>
      )}
    </article>
  );
}

function HowTo({ guide }: { guide: SbiGuide }) {
  return (
    <div className={styles.howto}>
      <span className={styles.howtoLabel}>SBI証券에서 받는 곳</span>
      <ol className={styles.path}>
        {guide.path.map((p) => (
          <li key={p}>
            <span>{p}</span>
          </li>
        ))}
      </ol>
      {guide.tip && <p className={styles.tip}>{guide.tip}</p>}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg className={styles.uploadIcon} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v3.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
