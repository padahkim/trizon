"use client";

import Link from "next/link";
import { useActionState, useState, type FormEvent } from "react";
import { MARKET_LABEL, MARKETS, TRADE_CURRENCY, type Currency, type Market } from "@/lib/domain/model.ts";
import type { Account, Holding } from "@/lib/domain/schema.ts";
import { quoteSymbolCandidates } from "@/lib/domain/symbols.ts";
import { CURRENCY_SUFFIX, formatMoney, formatUnitPrice } from "@/lib/format/money.ts";
import { impliedFxRate, isFxRateSuspicious, scaleCostBasis } from "@/lib/portfolio/cost-basis.ts";
import { crossRate, type FxRates } from "@/lib/portfolio/fx.ts";
import { saveHolding, type FormState } from "../actions.ts";
import styles from "./holdings.module.css";
import { SymbolSearch, type PickedSymbol } from "./SymbolSearch.tsx";

/** 폼 입력 문자열 → 숫자 (서버 스키마와 같은 규칙: 콤마·공백 제거, 빈 칸은 undefined) */
function num(s: string): number | undefined {
  const t = s.replace(/[,\s]/g, "");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

const plain = (n: number) => String(Math.round(n * 1e6) / 1e6);

type BasisMode = "total" | "perShare";
// SBI 는 取得単価(円換算)을 1주당으로 보여주고, 한국 증권사는 원화 매입금액을 총액으로 보여준다
const defaultBasisMode = (c: Currency): BasisMode => (c === "JPY" ? "perShare" : "total");

export function HoldingForm(props: { accounts: Account[]; rates: FxRates | null; initial?: Holding }) {
  const { accounts, rates, initial } = props;
  const [state, action, pending] = useActionState<FormState, FormData>(saveHolding, { ok: true });

  const firstAccount = accounts.find((a) => a.id === initial?.accountId) ?? accounts[0];
  const [accountId, setAccountId] = useState(firstAccount?.id ?? "");
  const [market, setMarket] = useState<Market>(initial?.market ?? (firstAccount?.homeCurrency === "JPY" ? "JP" : "KR"));
  // 검색 목록에서 고르면 picked 의 코드를, 고르지 않았으면 입력값을 그대로 코드로 보낸다
  const [query, setQuery] = useState(initial?.name ?? "");
  const [picked, setPicked] = useState<PickedSymbol | null>(
    initial ? { market: initial.market, code: initial.code, name: initial.name, exchange: "" } : null,
  );
  const [symbolError, setSymbolError] = useState<string>();
  const [name, setName] = useState(initial?.name ?? "");
  const [quantity, setQuantity] = useState(initial ? plain(initial.quantity) : "");
  const [avgCost, setAvgCost] = useState(initial ? plain(initial.avgCost) : "");
  const currencyOf = (id: string): Currency => (accounts.find((a) => a.id === id) ?? firstAccount)?.homeCurrency ?? "KRW";
  const homeCurrency = currencyOf(accountId);
  const tradeCurrency = TRADE_CURRENCY[market];
  const foreign = tradeCurrency !== homeCurrency;

  const [mode, setMode] = useState<BasisMode>(initial?.costBasisHome !== undefined ? "total" : defaultBasisMode(homeCurrency));
  const [basis, setBasis] = useState(initial?.costBasisHome !== undefined ? plain(initial.costBasisHome) : "");
  const [unknown, setUnknown] = useState(initial !== undefined && foreign && initial.costBasisHome === undefined);

  // 계좌통화가 바뀌면 적어 둔 매입금액은 다른 통화의 금액이 되므로 비우고, 입력 단위도 새 계좌의 증권사 화면에 맞춘다
  function changeAccount(id: string) {
    setAccountId(id);
    const next = currencyOf(id);
    if (next === homeCurrency) return;
    setMode(defaultBasisMode(next));
    setBasis("");
  }

  const e = state.fieldErrors ?? {};
  const qty = num(quantity);
  const avg = num(avgCost);
  const basisAmount = num(basis);
  const basisTotal = basisAmount === undefined || qty === undefined ? undefined : mode === "perShare" ? basisAmount * qty : basisAmount;

  // 평균 매입환율 가드 — 추가 매수 뒤 매입금액 갱신을 잊으면 이 값이 현재 환율에서 크게 벗어난다
  const implied = foreign && !unknown && basisTotal !== undefined && qty && avg !== undefined ? impliedFxRate(basisTotal, qty, avg) : null;
  const current = rates && foreign ? crossRate(tradeCurrency, homeCurrency, rates) : null;
  const suspicious = implied !== null && current !== null && isFxRateSuspicious(implied, current);

  // 매도 반영 제안 — 수량을 줄였는데 매입금액(총액)이 그대로일 때
  const sellSuggestion =
    initial?.costBasisHome !== undefined &&
    foreign &&
    mode === "total" &&
    qty !== undefined &&
    qty > 0 &&
    qty < initial.quantity &&
    basisAmount === initial.costBasisHome
      ? scaleCostBasis(initial.costBasisHome, initial.quantity, qty)
      : null;

  // 이름을 쳐 놓고 목록에서 고르지 않은 채 저장하면 서버의 "6자리입니다" 대신 여기서 알려 준다
  function checkSymbol(ev: FormEvent<HTMLFormElement>) {
    if (picked) return;
    const q = query.trim();
    const asCode = quoteSymbolCandidates(market, q);
    if (asCode.ok) return;
    ev.preventDefault();
    setSymbolError(q === "" ? "종목을 검색해 고르세요" : /^[0-9A-Za-z.\-]+$/.test(q) ? asCode.error : "검색 결과에서 종목을 고르세요");
  }

  const rateText = (r: number) =>
    `${r.toLocaleString("ko-KR", { maximumFractionDigits: tradeCurrency === "JPY" ? 4 : 2 })}${CURRENCY_SUFFIX[homeCurrency]}/${CURRENCY_SUFFIX[tradeCurrency]}`;

  return (
    <form action={action} onSubmit={checkSymbol} className={`panel ${styles.form}`}>
      <div className={styles.formHead}>
        <h2>{initial ? `종목 수정 — ${initial.name}` : "종목 추가"}</h2>
        {initial && (
          <Link href="/holdings" className="btn btn-quiet">
            취소
          </Link>
        )}
      </div>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="code" value={picked?.code ?? query} />

      <div className={styles.grid}>
        <div className="field">
          <label htmlFor="f-account">계좌</label>
          <select id="f-account" name="accountId" value={accountId} onChange={(ev) => changeAccount(ev.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.homeCurrency})
              </option>
            ))}
          </select>
          {e.accountId && <span className="error">{e.accountId[0]}</span>}
        </div>

        <SymbolSearch
          preferMarket={market}
          query={query}
          picked={picked}
          error={symbolError ?? e.code?.[0]}
          onQueryChange={(q) => {
            setQuery(q);
            setPicked(null);
            setSymbolError(undefined);
            // 고른 종목이 채운 이름은 같이 비운다 (직접 고친 이름은 둔다)
            if (picked && name === picked.name) setName("");
          }}
          onPick={(hit) => {
            setQuery(hit.name);
            setPicked(hit);
            setMarket(hit.market);
            setName(hit.name);
            setSymbolError(undefined);
          }}
        />

        <div className="field">
          <label htmlFor="f-market">시장</label>
          <select
            id="f-market"
            name="market"
            value={market}
            onChange={(ev) => {
              const m = ev.target.value as Market;
              setMarket(m);
              if (picked && picked.market !== m) {
                setPicked(null);
                if (name === picked.name) setName("");
              }
            }}
          >
            {MARKETS.map((m) => (
              <option key={m} value={m}>
                {MARKET_LABEL[m]} ({TRADE_CURRENCY[m]})
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-name">종목명 (선택)</label>
          <input id="f-name" type="text" name="name" placeholder="비우면 자동으로 채움" value={name} onChange={(ev) => setName(ev.target.value)} />
          <span className="hint">화면에 보일 이름 — 고쳐도 됩니다</span>
        </div>

        <div className="field">
          <label htmlFor="f-qty">수량</label>
          <input id="f-qty" type="text" inputMode="decimal" name="quantity" value={quantity} onChange={(ev) => setQuantity(ev.target.value)} />
          {e.quantity && <span className="error">{e.quantity[0]}</span>}
        </div>

        <div className="field">
          <label htmlFor="f-avg">평균단가 ({tradeCurrency})</label>
          <input id="f-avg" type="text" inputMode="decimal" name="avgCost" value={avgCost} onChange={(ev) => setAvgCost(ev.target.value)} />
          {e.avgCost ? (
            <span className="error">{e.avgCost[0]}</span>
          ) : (
            qty !== undefined &&
            avg !== undefined && <span className="hint">매입금액 {formatMoney(qty * avg, tradeCurrency, "exact")}</span>
          )}
        </div>
      </div>

      {foreign && (
        <fieldset className={styles.basis}>
          <legend>
            {homeCurrency} 기준 매입금액 <span className="muted">— 환차손익까지 증권사 화면과 맞추기 위해 필요합니다</span>
          </legend>
          <div className={styles.basisRow}>
            <div className="segmented" role="radiogroup" aria-label="입력 단위">
              {(["total", "perShare"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
                  {m === "total" ? "총액" : "1주당"}
                </button>
              ))}
            </div>
            <input type="hidden" name="costBasisMode" value={mode} />
            <div className="field">
              <input
                type="text"
                inputMode="decimal"
                name="costBasisAmount"
                aria-label={`${homeCurrency} 기준 매입금액`}
                disabled={unknown}
                placeholder={homeCurrency === "JPY" ? "取得単価(円換算)" : "원화 매입금액"}
                value={unknown ? "" : basis}
                onChange={(ev) => setBasis(ev.target.value)}
              />
            </div>
            <label className={styles.check}>
              <input type="checkbox" name="costBasisUnknown" checked={unknown} onChange={(ev) => setUnknown(ev.target.checked)} />
              모름 (현재 환율로 계산)
            </label>
          </div>
          {e.costBasisAmount && <span className="error">{e.costBasisAmount[0]}</span>}
          <p className="hint">
            {homeCurrency === "JPY"
              ? "SBI証券: 外国株式 보유증권 화면의 取得単価(円換算)을 1주당으로 넣으세요."
              : "KB·NH·토스: 해외주식 잔고 화면의 원화 매입금액(총액)을 넣으세요."}
          </p>
          {implied !== null && (
            <p className={suspicious ? "notice" : "hint"}>
              평균 매입환율 {rateText(implied)}
              {current !== null && <> (현재 {rateText(current)})</>}
              {suspicious && " — 현재 환율과 25% 넘게 차이 납니다. 추가 매수·매도 뒤 매입금액을 고치지 않았는지 확인하세요."}
            </p>
          )}
          {sellSuggestion !== null && (
            <p className="notice">
              수량을 줄였는데 매입금액이 그대로입니다. 매도 반영 시 {formatMoney(sellSuggestion, homeCurrency, "exact")}{" "}
              <button type="button" className="btn" onClick={() => setBasis(plain(sellSuggestion))}>
                적용
              </button>
            </p>
          )}
        </fieldset>
      )}

      <div className={styles.formFoot}>
        <button type="submit" className="btn btn-primary" disabled={pending || accounts.length === 0}>
          {pending ? "시세 확인 중…" : initial ? "수정 저장" : "추가"}
        </button>
        {state.message && !state.ok && <span className="error">{state.message}</span>}
        {initial && (
          <span className="muted">
            현재 평균단가 {formatUnitPrice(initial.avgCost, TRADE_CURRENCY[initial.market])} · 수량 {initial.quantity}
          </span>
        )}
      </div>
    </form>
  );
}
