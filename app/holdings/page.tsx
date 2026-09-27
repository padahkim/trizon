import Link from "next/link";
import { connection } from "next/server";
import { CURRENCY_SUFFIX, formatMoney, formatQuantity, formatUnitPrice } from "@/lib/format/money.ts";
import { MARKET_LABEL, TRADE_CURRENCY } from "@/lib/domain/model.ts";
import { impliedFxRate, isFxRateSuspicious } from "@/lib/portfolio/cost-basis.ts";
import { crossRate, type FxRates } from "@/lib/portfolio/fx.ts";
import { getQuoteService, getStore } from "@/lib/server.ts";
import { localDate } from "@/lib/store/snapshots.ts";
import { PortfolioFileError } from "@/lib/store/types.ts";
import { deleteAccount, deleteHolding } from "../actions.ts";
import { ConfirmSubmit } from "../_components/ConfirmSubmit.tsx";
import { FileErrorPanel } from "../_components/FileErrorPanel.tsx";
import { AccountForm } from "./AccountForm.tsx";
import { HoldingForm } from "./HoldingForm.tsx";
import styles from "./holdings.module.css";

export default async function HoldingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const sp = await searchParams;
  const editId = typeof sp.edit === "string" ? sp.edit : undefined;

  let file;
  try {
    file = await getStore().load();
  } catch (err) {
    if (err instanceof PortfolioFileError) return <FileErrorPanel error={err} />;
    throw err;
  }

  // 평균 매입환율 가드용 현재 환율 — 못 받아도 입력은 된다
  let rates: FxRates | null = null;
  try {
    rates = (await getQuoteService().get([])).fx.rates;
  } catch {
    rates = null;
  }

  const editing = editId ? file.holdings.find((h) => h.id === editId) : undefined;

  return (
    <div className={styles.stack}>
      <div className={styles.head}>
        <h1>보유종목 관리</h1>
        <span className="muted">증권사 앱의 잔고 화면을 보고 옮겨 적으세요. 시세와 환율은 자동으로 가져옵니다.</span>
      </div>

      {editId && !editing && <p className="notice">수정하려는 종목을 찾을 수 없습니다. 이미 삭제됐을 수 있습니다.</p>}
      <HoldingForm
        key={editing ? `edit-${editing.id}-${editing.updatedAt}` : `new-${file.holdings.length}`}
        accounts={file.accounts}
        rates={rates}
        initial={editing}
      />

      {file.accounts.map((account) => {
        const own = file.holdings.filter((h) => h.accountId === account.id);
        return (
          <section key={account.id} className="panel">
            <div className={styles.accountHead}>
              <h2>
                {account.label} <span className="pill">{account.homeCurrency}</span>
                <span className="muted" style={{ fontSize: "0.85rem", fontWeight: 400 }}>
                  {own.length}종목
                </span>
              </h2>
              <form action={deleteAccount}>
                <input type="hidden" name="id" value={account.id} />
                <ConfirmSubmit
                  message={`${account.label} 계좌를 삭제할까요?`}
                  disabled={own.length > 0}
                  title={own.length > 0 ? "종목이 남아 있는 계좌는 삭제할 수 없습니다" : undefined}
                >
                  계좌 삭제
                </ConfirmSubmit>
              </form>
            </div>
            {own.length === 0 ? (
              <p className={`muted ${styles.empty}`}>아직 종목이 없습니다.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>종목</th>
                      <th>시장</th>
                      <th className="r">수량</th>
                      <th className="r">평균단가</th>
                      <th className="r">매입금액 ({account.homeCurrency})</th>
                      <th className="r">평균 매입환율</th>
                      <th>수정일</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {own.map((h) => {
                      const trade = TRADE_CURRENCY[h.market];
                      const foreign = trade !== account.homeCurrency;
                      const implied = foreign && h.costBasisHome !== undefined ? impliedFxRate(h.costBasisHome, h.quantity, h.avgCost) : null;
                      const current = rates && foreign ? crossRate(trade, account.homeCurrency, rates) : null;
                      const suspicious = implied !== null && current !== null && isFxRateSuspicious(implied, current);
                      return (
                        <tr key={h.id} style={h.id === editId ? { background: "var(--surface-2)" } : undefined}>
                          <td>
                            {h.name}
                            <span className="sub">{h.quoteSymbol}</span>
                          </td>
                          <td>{MARKET_LABEL[h.market]}</td>
                          <td className="r num">{formatQuantity(h.quantity)}</td>
                          <td className="r num">{formatUnitPrice(h.avgCost, trade)}</td>
                          <td className="r num">
                            {foreign ? (
                              h.costBasisHome !== undefined ? (
                                formatMoney(h.costBasisHome, account.homeCurrency, "exact")
                              ) : (
                                <span className="pill pill-warn">미입력 · 환율효과 미반영</span>
                              )
                            ) : (
                              formatMoney(h.quantity * h.avgCost, account.homeCurrency, "exact")
                            )}
                          </td>
                          <td className="r num">
                            {implied !== null ? (
                              <>
                                {implied.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                                {CURRENCY_SUFFIX[account.homeCurrency]}/{CURRENCY_SUFFIX[trade]}
                                {suspicious && (
                                  <span className="sub" style={{ color: "var(--warn-ink)" }}>
                                    현재 환율과 25% 넘게 차이
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="muted num">{localDate(new Date(h.updatedAt))}</td>
                          <td>
                            <div className={styles.actions}>
                              <Link href={`/holdings?edit=${h.id}`} className="btn btn-quiet">
                                수정
                              </Link>
                              <form action={deleteHolding}>
                                <input type="hidden" name="id" value={h.id} />
                                <ConfirmSubmit message={`${h.name} (${account.label})을(를) 삭제할까요?`}>삭제</ConfirmSubmit>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <section className="panel">
        <div className={styles.accountHead}>
          <h2>계좌 추가</h2>
          <span className="muted">SBI 特定/NISA, ISA처럼 계좌를 나눠 관리하고 싶을 때</span>
        </div>
        <AccountForm />
      </section>
    </div>
  );
}
