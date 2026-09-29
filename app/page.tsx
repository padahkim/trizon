import Link from "next/link";
import { after, connection } from "next/server";
import { CURRENCIES, isCurrency, MARKET_LABEL, type Currency } from "@/lib/domain/model.ts";
import { formatMonthDay } from "@/lib/format/date.ts";
import { CURRENCY_SUFFIX, formatMoney, formatPercent, formatQuantity, formatUnitPrice, perUnitsLabel, type FormatMode } from "@/lib/format/money.ts";
import { buildPortfolioView, type HoldingEval } from "@/lib/portfolio/calc.ts";
import { convert, crossRate } from "@/lib/portfolio/fx.ts";
import { NoFxError } from "@/lib/quotes/service.ts";
import { EMPTY_SBI_DASHBOARD, isSbiFundSymbol, sbiForDashboard, withFallback, type SbiDashboard } from "@/lib/sbi/evaluate.ts";
import { parseImports } from "@/lib/sbi/parse.ts";
import { SbiImportFileError } from "@/lib/sbi/store.ts";
import { getQuoteService, getSbiStore, getStore, SNAPSHOTS_PATH } from "@/lib/server.ts";
import { appendDailySnapshot, snapshotFromView } from "@/lib/store/snapshots.ts";
import { PortfolioFileError } from "@/lib/store/types.ts";
import { FileErrorPanel } from "./_components/FileErrorPanel.tsx";
import { hrefWith, type SearchParams } from "./_components/href.ts";
import { Money, Pct } from "./_components/figures.tsx";
import { RefreshButton } from "./_components/RefreshButton.tsx";
import styles from "./page.module.css";

const SORTS = ["account", "value", "pnl", "returnHome", "returnTrade"] as const;
type Sort = (typeof SORTS)[number];

const CURRENCY_NAME: Record<Currency, string> = { KRW: "원", JPY: "엔", USD: "달러" };

const timeText = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    : "—";

export default async function Dashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const ccy: Currency = isCurrency(sp.ccy) ? sp.ccy : "KRW";
  const fmt: FormatMode = sp.fmt === "exact" ? "exact" : "compact";
  const sort: Sort = (SORTS as readonly string[]).includes(String(sp.sort)) ? (sp.sort as Sort) : "account";

  let file;
  try {
    file = await getStore().load();
  } catch (err) {
    if (err instanceof PortfolioFileError) return <FileErrorPanel error={err} />;
    throw err;
  }

  // SBI 포트폴리오 CSV 의 보유종목 (portfolio.json 에는 쓰지 않고 여기서 합친다). 저장 파일이 깨져도 대시보드는 뜬다
  let sbi: SbiDashboard = EMPTY_SBI_DASHBOARD;
  try {
    sbi = sbiForDashboard(parseImports(await getSbiStore().load()).portfolio, file.accounts, file.holdings);
  } catch (err) {
    if (!(err instanceof SbiImportFileError)) throw err;
    sbi = { ...EMPTY_SBI_DASHBOARD, warnings: ["SBI CSV 저장 파일을 읽을 수 없어 SBI 보유종목을 빼고 보여 줍니다 — SBI 손익 화면에서 확인하세요"] };
  }
  const holdings = [...file.holdings, ...sbi.holdings];

  let market;
  try {
    // 투자신탁은 시세 서버에 없으므로 CSV 기준가를 쓰고 조회하지 않는다
    market = await getQuoteService().get(holdings.map((h) => h.quoteSymbol).filter((s) => !sbi.fundQuotes[s]));
  } catch (err) {
    if (err instanceof NoFxError) {
      return (
        <div className="panel notice-danger">
          <h2>환율을 가져오지 못했습니다</h2>
          <p>{err.message}</p>
          <p>네트워크를 확인한 뒤 새로고침하세요. 한 번이라도 받아 두면 다음부터는 저장된 환율로 화면이 뜹니다.</p>
        </div>
      );
    }
    throw err;
  }

  const now = new Date();
  const rates = market.fx.rates;
  const quotes = { ...withFallback(market.quotes, sbi.csvQuotes), ...sbi.fundQuotes };
  const view = buildPortfolioView({
    accounts: file.accounts,
    holdings,
    quotes,
    rates,
    now,
    displayCurrency: ccy,
  });

  // 하루 한 줄 스냅샷 — 응답을 보낸 뒤 기록한다
  if (holdings.length > 0) {
    after(() => appendDailySnapshot(SNAPSHOTS_PATH, snapshotFromView(view, rates, now)).catch((e) => console.error("snapshot", e)));
  }

  const toDisplay = (e: HoldingEval, amount: number) => convert(amount, e.homeCurrency, ccy, rates);
  const rows = sortRows(view.holdings, sort, toDisplay);
  const quoteTimes = Object.values(market.quotes).map((q) => q.marketTime).filter(Boolean).sort();
  const fundCount = view.holdings.filter((e) => isSbiFundSymbol(e.holding.quoteSymbol)).length;
  const others = CURRENCIES.filter((c) => c !== ccy);

  return (
    <div className={styles.stack}>
      {/* ── 헤드라인 ─────────────────────────────── */}
      <section className={`panel ${styles.heroPanel}`}>
        <div className={styles.controls}>
          <nav className="segmented" aria-label="표시 통화">
            {CURRENCIES.map((c) => (
              <Link key={c} href={hrefWith("/", sp, { ccy: c === "KRW" ? undefined : c })} aria-current={c === ccy}>
                {CURRENCY_NAME[c]}
              </Link>
            ))}
          </nav>
          <nav className="segmented" aria-label="표시 형식">
            <Link href={hrefWith("/", sp, { fmt: undefined })} aria-current={fmt === "compact"}>
              간략
            </Link>
            <Link href={hrefWith("/", sp, { fmt: "exact" })} aria-current={fmt === "exact"}>
              정확
            </Link>
          </nav>
          <div className={styles.refresh}>
            <span className="muted">
              시세 {quoteTimes.length > 0 ? `${timeText(quoteTimes[0])} ~ ${timeText(quoteTimes[quoteTimes.length - 1])}` : "—"}
            </span>
            <RefreshButton />
          </div>
        </div>

        <div className={styles.hero}>
          <span className={styles.heroLabel}>총 평가액</span>
          <span className={styles.heroValue} title={formatMoney(view.total.value, ccy, "exact")}>
            {formatMoney(view.total.value, ccy, fmt)}
          </span>
          <span className={styles.heroOthers}>
            {others.map((c, i) => (
              <span key={c}>
                {i > 0 && " · "}≈ {formatMoney(view.totalIn[c].value, c, fmt)}
              </span>
            ))}
          </span>
        </div>

        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>평가손익</span>
            <span className={styles.kpiValue}>
              <Money amount={view.total.pnl} currency={ccy} mode={fmt} signed colored />
            </span>
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>총수익률</span>
            <span className={styles.kpiValue}>
              <Pct rate={view.total.returnRate} />
            </span>
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>매입금액</span>
            <span className={styles.kpiValue}>
              <Money amount={view.total.cost} currency={ccy} mode={fmt} />
            </span>
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>보유종목</span>
            <span className={styles.kpiValue}>
              {view.holdings.length}
              <span className={styles.kpiUnit}>종목</span>
            </span>
          </div>
        </div>
      </section>

      {/* ── 경고 ─────────────────────────────────── */}
      {(view.counts.missing > 0 ||
        view.counts.stale > 0 ||
        view.counts.fxNotIncluded > 0 ||
        market.errors.length > 0 ||
        market.fx.fromCache ||
        sbi.warnings.length > 0) && (
        <div className={styles.notices}>
          {sbi.warnings.map((w) => (
            <p key={w} className="notice">
              {w} <Link href="/sbi">SBI 손익</Link>
            </p>
          ))}
          {view.counts.missing > 0 && (
            <p className="notice notice-danger">
              가격 미확인 {view.counts.missing}종목 — 평가액을 매입금액으로 계산해 합계에 넣었습니다 (손익 0).
            </p>
          )}
          {view.counts.stale > 0 && (
            <p className="notice">
              이전·오래된 시세 {view.counts.stale}종목 — 이번 조회에 실패했거나 5영업일 넘게 시세가 없습니다.
            </p>
          )}
          {view.counts.fxNotIncluded > 0 && (
            <p className="notice">
              환율효과 미반영 {view.counts.fxNotIncluded}종목 — 해외 종목의 계좌통화 매입금액이 없어 현재 환율로 계산했습니다.{" "}
              <Link href="/holdings">입력하기</Link>
            </p>
          )}
          {market.fx.fromCache && <p className="notice">환율을 새로 받지 못해 저장된 환율({timeText(market.fx.asOf)} 기준)을 씁니다.</p>}
          {market.errors.map((e) => (
            <p key={e} className="notice">
              {e}
            </p>
          ))}
        </div>
      )}

      {view.holdings.length === 0 ? (
        <section className="panel">
          <h2>아직 보유종목이 없습니다</h2>
          <p className="secondary">증권사 앱의 잔고 화면을 보면서 종목·수량·평균단가를 넣으면 여기서 한 번에 모아 봅니다.</p>
          <div className={styles.emptyActions}>
            <Link href="/holdings" className="btn btn-primary">
              보유종목 추가하기
            </Link>
            <Link href="/sbi" className="btn">
              SBI証券은 CSV로 가져오기
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* ── 시장별 비중 ─────────────────────── */}
          <section className="panel">
            <div className={styles.sectionHead}>
              <h2>시장별 비중</h2>
              <span className="muted">{CURRENCY_NAME[ccy]} 기준 평가액</span>
            </div>
            <div className={styles.allocBar} role="img" aria-label="시장별 비중 막대 (아래 범례에 값이 있습니다)">
              {view.byMarket
                .filter((m) => m.value > 0)
                .map((m) => (
                  <span
                    key={m.market}
                    tabIndex={0}
                    className={styles.allocSeg}
                    style={{ flexGrow: m.weight, background: `var(--mk-${m.market})` }}
                    data-tip={`${MARKET_LABEL[m.market]} ${formatPercent(m.weight, { signed: false })} · ${formatMoney(m.value, ccy, fmt)}`}
                  />
                ))}
            </div>
            <ul className={styles.legend}>
              {view.byMarket.map((m) => (
                <li key={m.market}>
                  <span className={styles.swatch} style={{ background: `var(--mk-${m.market})` }} />
                  <span>{MARKET_LABEL[m.market]}</span>
                  <strong className="num">{formatPercent(m.weight, { signed: false })}</strong>
                  <span className="muted num">{formatMoney(m.value, ccy, fmt)}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* ── 계좌별 ──────────────────────────── */}
          <section className={styles.accounts}>
            {view.accounts.map((a) => (
              <div key={a.account.id} className={`panel ${styles.accountCard}`}>
                <div className={styles.accountTop}>
                  <span className={styles.accountName}>{a.account.label}</span>
                  <span className="muted">
                    {a.holdings.length}종목 · {formatPercent(view.total.value > 0 ? a.display.value / view.total.value : 0, { signed: false })}
                  </span>
                </div>
                <span className={styles.accountValue}>
                  <Money amount={a.home.value} currency={a.account.homeCurrency} mode={fmt} />
                </span>
                {a.account.homeCurrency !== ccy && (
                  <span className="muted">
                    ≈ <Money amount={a.display.value} currency={ccy} mode={fmt} />
                  </span>
                )}
                <span className={styles.accountPnl}>
                  <Money amount={a.home.pnl} currency={a.account.homeCurrency} mode={fmt} signed colored /> <Pct rate={a.home.returnRate} />
                </span>
                {a.account.id === sbi.account?.id && (
                  <Link href="/sbi" className={styles.accountLink}>
                    CSV로 가져옴 · 누적손익 보기 →
                  </Link>
                )}
              </div>
            ))}
          </section>

          {/* ── 보유종목 ────────────────────────── */}
          <section className="panel">
            <div className={styles.sectionHead}>
              <h2>보유종목</h2>
              <span className="muted">열 제목을 누르면 정렬됩니다 · 평가액·손익은 {CURRENCY_NAME[ccy]} 기준</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>
                      <SortLink sp={sp} sort={sort} value="account">
                        종목 / 계좌
                      </SortLink>
                    </th>
                    <th className="r">수량</th>
                    <th className="r">현재가 / 평균단가</th>
                    <th className="r">
                      <SortLink sp={sp} sort={sort} value="value">
                        평가액
                      </SortLink>
                    </th>
                    <th className="r">
                      <SortLink sp={sp} sort={sort} value="pnl">
                        평가손익
                      </SortLink>
                    </th>
                    <th className="r">
                      <SortLink sp={sp} sort={sort} value="returnTrade">
                        주가 수익률
                      </SortLink>
                    </th>
                    <th className="r">
                      <SortLink sp={sp} sort={sort} value="returnHome">
                        계좌통화 수익률
                      </SortLink>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.holding.id}>
                      <td>
                        <span className={styles.stockName}>{e.holding.name}</span>
                        <PriceBadge e={e} />
                        <span className="sub">
                          {isSbiFundSymbol(e.holding.quoteSymbol) ? "투자신탁" : e.holding.quoteSymbol} · {e.account.label}
                        </span>
                      </td>
                      <td className="r num">
                        {formatQuantity(e.holding.quantity)}
                        {e.holding.priceUnit ? "좌" : ""}
                      </td>
                      <td className="r num">
                        {e.price !== null ? (
                          formatUnitPrice(e.price, e.tradeCurrency) + perUnitsLabel(e.holding.priceUnit)
                        ) : (
                          <span className="muted">—</span>
                        )}
                        <span className="sub">{formatUnitPrice(e.holding.avgCost, e.tradeCurrency) + perUnitsLabel(e.holding.priceUnit)}</span>
                      </td>
                      <td className="r">
                        <Money amount={toDisplay(e, e.valueHome)} currency={ccy} mode={fmt} />
                        {e.homeCurrency !== ccy && (
                          <span className="sub num">{formatMoney(e.valueHome, e.homeCurrency, fmt)}</span>
                        )}
                      </td>
                      <td className="r">
                        <Money amount={toDisplay(e, e.pnlHome)} currency={ccy} mode={fmt} signed colored />
                      </td>
                      <td className="r">
                        <Pct rate={e.returnTrade} />
                      </td>
                      <td className="r">
                        <Pct rate={e.returnHome} />
                        {!e.fxEffectIncluded && (
                          <span className="sub" title="계좌통화 매입금액이 없어 현재 환율로 환산했습니다">
                            환율효과 미반영
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ── 환율 ─────────────────────────────────── */}
      <footer className={styles.fx}>
        <p>
          적용 환율 ({market.fx.source}, {timeText(market.fx.asOf)} 기준): 1달러 ={" "}
          {formatUnitPrice(rates.KRW, "KRW")} · 1달러 = {formatUnitPrice(rates.JPY, "JPY")} · 100엔 ={" "}
          {formatUnitPrice(crossRate("JPY", "KRW", rates) * 100, "KRW")}
        </p>
        {fundCount > 0 && sbi.asOf && (
          <p>
            투자신탁 {fundCount}종목은 시세를 받을 수 없어 SBI 포트폴리오 CSV({timeText(sbi.asOf)}에 받음)의 기준가로 계산합니다. 사고팔았을 때{" "}
            <Link href="/sbi">CSV를 다시 넣으세요</Link>.
          </p>
        )}
        <p className="muted">
          계좌마다 계좌통화({CURRENCY_SUFFIX.KRW}·{CURRENCY_SUFFIX.JPY}) 기준으로 평가한 뒤 현재 환율로 합칩니다. 그래서 총수익률은 표시 통화와
          관계없이 같고, 원↔엔 환율 변동은 총수익률에 들어가지 않습니다. 미국 주식 평가액은 증권사가 쓰는 환율과 0.5% 안팎 차이 날 수
          있습니다.
        </p>
      </footer>
    </div>
  );
}

function PriceBadge({ e }: { e: HoldingEval }) {
  if (e.priceStatus === "missing") return <span className="pill pill-danger">가격 미확인</span>;
  if (e.priceStatus === "imported") {
    return (
      <span className="pill" title="시세 대신 SBI 포트폴리오 CSV의 가격을 씁니다">
        CSV {formatMonthDay(e.quote?.marketTime ?? "")}
      </span>
    );
  }
  if (e.priceStatus === "stale") {
    return (
      <span className="pill pill-warn" title={`시세 시각 ${e.quote?.marketTime ?? "알 수 없음"}`}>
        {e.quote?.fromCache ? "이전 시세" : "오래된 시세"}
      </span>
    );
  }
  return null;
}

function SortLink(props: { sp: SearchParams; sort: Sort; value: Sort; children: React.ReactNode }) {
  const active = props.sort === props.value;
  return (
    <Link href={hrefWith("/", props.sp, { sort: props.value === "account" ? undefined : props.value })} aria-current={active}>
      {props.children}
      {active && props.value !== "account" ? " ↓" : ""}
    </Link>
  );
}

function sortRows(rows: HoldingEval[], sort: Sort, toDisplay: (e: HoldingEval, amount: number) => number): HoldingEval[] {
  if (sort === "account") return rows; // 파일 순서 = 계좌 순서 → 입력 순
  const key = (e: HoldingEval): number | null => {
    switch (sort) {
      case "value":
        return toDisplay(e, e.valueHome);
      case "pnl":
        return toDisplay(e, e.pnlHome);
      case "returnHome":
        return e.returnHome;
      case "returnTrade":
        return e.returnTrade;
    }
  };
  // 내림차순, 계산 불가(null)는 맨 뒤
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null) return kb === null ? 0 : 1;
    if (kb === null) return -1;
    return kb - ka;
  });
}
