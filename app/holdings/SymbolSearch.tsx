"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MARKET_LABEL, type Market } from "@/lib/domain/model.ts";
import type { SymbolSearchResult } from "@/lib/symbols/service.ts";
import type { SymbolEntry } from "@/lib/symbols/types.ts";
import styles from "./holdings.module.css";

export type PickedSymbol = Pick<SymbolEntry, "market" | "code" | "name" | "exchange" | "kind">;

/**
 * 종목명·코드 자동완성 (ARIA combobox). 값(query)과 선택(picked)은 부모가 갖는다 —
 * 부모가 picked 로 hidden code 를 채우고, 고르지 않았으면 입력값을 코드로 보낸다.
 */
export function SymbolSearch(props: {
  preferMarket: Market;
  query: string;
  picked: PickedSymbol | null;
  error?: string;
  onQueryChange: (q: string) => void;
  onPick: (hit: SymbolEntry) => void;
}) {
  const { preferMarket, query, picked, error, onQueryChange, onPick } = props;
  const listId = useId();
  const [hits, setHits] = useState<SymbolEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ctrl = useRef<AbortController>(undefined);
  const warmed = useRef(false);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      ctrl.current?.abort();
    },
    [],
  );

  function search(q: string) {
    clearTimeout(timer.current);
    ctrl.current?.abort();
    if (q.trim() === "") {
      setHits([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const c = new AbortController();
      ctrl.current = c;
      try {
        const res = await fetch(`/api/symbols?${new URLSearchParams({ q, market: preferMarket })}`, { signal: c.signal });
        const body = (await res.json()) as SymbolSearchResult;
        setHits(body.ok ? body.hits : []);
        setWarnings(body.ok ? body.warnings : []);
        setSearchError(body.ok ? undefined : body.error);
        setActive(0);
        setOpen(true);
      } catch {
        if (c.signal.aborted) return;
        setHits([]);
        setSearchError("검색 서버에 연결하지 못했습니다");
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    }, 150);
  }

  function pick(hit: SymbolEntry) {
    clearTimeout(timer.current);
    ctrl.current?.abort();
    setLoading(false);
    setOpen(false);
    onPick(hit);
  }

  const showList = open && hits.length > 0;
  const activeHit = showList ? hits[active] : undefined;

  let hint: ReactNode;
  if (error) hint = <span className="error">{error}</span>;
  else if (searchError) hint = <span className="error">{searchError} — 종목코드를 직접 입력해도 됩니다</span>;
  else if (picked)
    hint = (
      <span className="hint">
        {[MARKET_LABEL[picked.market], picked.exchange].filter(Boolean).join(" ")} · {picked.code}
        {picked.kind && ` · ${picked.kind}`}
      </span>
    );
  else if (loading) hint = <span className="hint">검색 중…</span>;
  else if (open && query.trim() !== "" && hits.length === 0)
    hint = <span className="hint">찾는 종목이 없습니다. 종목코드를 직접 입력해도 됩니다{warnings.length > 0 && ` (${warnings.join(" / ")})`}</span>;
  else hint = <span className="hint">이름 일부나 코드로 찾습니다 (한·일·영)</span>;

  return (
    <div className={`field ${styles.symbolField}`}>
      <label htmlFor="f-symbol">종목</label>
      <div className={styles.combo}>
        <input
          id="f-symbol"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={activeHit ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="삼성전자, トヨタ, 엔비디아, 7203 …"
          value={query}
          onChange={(ev) => {
            onQueryChange(ev.target.value);
            search(ev.target.value);
          }}
          onFocus={() => {
            // 목록이 아직 없으면 서버가 받아 두게 한다 (처음 한 번 몇 초 걸린다)
            if (!warmed.current) {
              warmed.current = true;
              fetch("/api/symbols").catch(() => undefined);
            }
            if (!picked && hits.length > 0) setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={(ev) => {
            // 한글·일본어 IME 변환 중의 Enter/화살표는 IME 몫이다
            if (ev.nativeEvent.isComposing || ev.keyCode === 229) return;
            if (ev.key === "ArrowDown" && hits.length > 0) {
              ev.preventDefault();
              if (!open) setOpen(true);
              else setActive((i) => Math.min(i + 1, hits.length - 1));
            } else if (ev.key === "ArrowUp" && showList) {
              ev.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (ev.key === "Enter" && activeHit) {
              ev.preventDefault();
              pick(activeHit);
            } else if (ev.key === "Escape" && showList) {
              ev.preventDefault();
              setOpen(false);
            }
          }}
        />
        {showList && (
          // mousedown 기본동작을 막아 클릭하는 동안 input 이 blur 되지 않게 한다
          <ul id={listId} role="listbox" aria-label="검색 결과" className={styles.comboList} onMouseDown={(ev) => ev.preventDefault()}>
            {hits.map((h, i) => (
              <li
                key={`${h.market}:${h.code}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={styles.option}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(h)}
              >
                <span className={styles.optionMain}>
                  <span className={styles.optionName}>{h.name}</span>
                  {h.aliases.length > 0 && <span className={styles.optionAlias}>{h.aliases.join(" · ")}</span>}
                </span>
                <span className={styles.optionMeta}>
                  {h.kind && <span className="pill">{h.kind}</span>}
                  <span className="num">{h.code}</span>
                  <span className={styles.optionMarket}>
                    <i style={{ background: `var(--mk-${h.market})` }} />
                    {MARKET_LABEL[h.market]}·{h.exchange}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {hint}
    </div>
  );
}
