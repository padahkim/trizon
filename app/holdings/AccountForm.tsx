"use client";

import { useActionState, useState } from "react";
import { BROKER_LABEL, BROKERS, CURRENCIES, type Broker, type Currency } from "@/lib/domain/model.ts";
import { addAccount, type FormState } from "../actions.ts";
import styles from "./holdings.module.css";

const defaultCurrency = (b: Broker): Currency => (b === "SBI" ? "JPY" : "KRW");

export function AccountForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addAccount, { ok: true });
  const [broker, setBroker] = useState<Broker>("SBI");
  const [currency, setCurrency] = useState<Currency>("JPY");

  // 계좌 이름은 비제어 입력 — 제출이 끝나면 React 가 폼을 비운다
  return (
    <form action={action} className={styles.accountForm}>
      <div className="field">
        <label htmlFor="acc-broker">증권사</label>
        <select
          id="acc-broker"
          name="broker"
          value={broker}
          onChange={(e) => {
            const b = e.target.value as Broker;
            setBroker(b);
            setCurrency(defaultCurrency(b));
          }}
        >
          {BROKERS.map((b) => (
            <option key={b} value={b}>
              {BROKER_LABEL[b]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="acc-label">계좌 이름</label>
        <input
          id="acc-label"
          type="text"
          name="label"
          placeholder="예: SBI証券 NISA"
        />
        {state.fieldErrors?.label && <span className="error">{state.fieldErrors.label[0]}</span>}
      </div>
      <div className="field">
        <label htmlFor="acc-ccy">계좌 통화</label>
        <select id="acc-ccy" name="homeCurrency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.accountSubmit}>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "추가 중…" : "계좌 추가"}
        </button>
        {state.message && <span className={state.ok ? "muted" : "error"}>{state.message}</span>}
      </div>
    </form>
  );
}
