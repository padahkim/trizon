import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Fragment } from "react";
import { CURRENCIES, isCurrency, type Currency } from "@/lib/domain/model.ts";
import type { Account } from "@/lib/domain/schema.ts";
import { formatMonthDay } from "@/lib/format/date.ts";
import { CURRENCY_SUFFIX, formatMoney, formatQuantity, formatUnitPrice, perUnitsLabel, type FormatMode } from "@/lib/format/money.ts";
import { sumTotals, type PriceStatus } from "@/lib/portfolio/calc.ts";
import { convert, type FxRates } from "@/lib/portfolio/fx.ts";
import { NoFxError, type MarketData } from "@/lib/quotes/service.ts";
import { pickSbiAccount, sbiHoldings, valueSbiHoldings, withFallback, type MarginEval, type SbiLotEval, type SbiValuation } from "@/lib/sbi/evaluate.ts";
import { groupDividendsByStock, isFundProduct, perShareJpy } from "@/lib/sbi/group.ts";
import { productLabel, SBI_GUIDE } from "@/lib/sbi/guide.ts";
import { parseImports, type LoadedImport, type LoadedSbi } from "@/lib/sbi/parse.ts";
import { sbiPeriodIssue } from "@/lib/sbi/periods.ts";
import { SbiImportFileError } from "@/lib/sbi/store.ts";
import type { Period, SbiDividends, SbiKind, SbiRealized } from "@/lib/sbi/types.ts";
import { getQuoteService, getSbiStore, getStore } from "@/lib/server.ts";
import { PortfolioFileError } from "@/lib/store/types.ts";
import { FileErrorPanel } from "../_components/FileErrorPanel.tsx";
import { directionClass, Money, Pct } from "../_components/figures.tsx";
import { hrefWith, type SearchParams } from "../_components/href.ts";
import { RefreshButton } from "../_components/RefreshButton.tsx";
import { ExpandRow } from "./ExpandRow.tsx";
import { SbiImport, type ImportCardView } from "./SbiImport.tsx";
import styles from "./sbi.module.css";

export const metadata: Metadata = { title: "SBI 누적손익 · trizon" };

/** SBI 계좌가 없을 때 이 화면에서만 쓰는 계좌 (대시보드에는 들어가지 않는다) */
const FALLBACK_ACCOUNT: Account = { id: "sbi", broker: "SBI", label: "SBI証券", homeCurrency: "JPY" };

const ymd = (iso: string) => iso.split("-").map(Number).join("/");
const periodText = (p: Period | null) => (p ? `${ymd(p.from)} ~ ${ymd(p.to)}` : "기간 정보 없음");
const timeText = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const exactYen = (n: number, signed = false) => formatMoney(n, "JPY", "exact", { signed });

const ok = <T,>(entry: LoadedImport<T> | null): T | null => (entry?.parsed.ok ? entry.parsed.data : null);

export default async function SbiPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection();
  const sp = await searchParams;
  const fmt: FormatMode = sp.fmt === "exact" ? "exact" : "compact";

  let loaded: LoadedSbi;
  try {
    loaded = parseImports(await getSbiStore().load());
  } catch (err) {
    if (err instanceof SbiImportFileError) {
      return <FileErrorPanel error={err} hint="이 파일은 CSV를 다시 넣으면 새로 만들어지므로, 고치기 어려우면 지운 뒤 새로고침해도 됩니다." />;
    }
    throw err;
  }

  // 보유종목을 넣을 SBI 계좌. portfolio.json 이 깨져 있어도 이 화면은 뜬다 (대시보드가 따로 알려 준다)
  let accounts: Account[] = [];
  try {
    accounts = (await getStore().load()).accounts;
  } catch (err) {
    if (!(err instanceof PortfolioFileError)) throw err;
  }
  const target = pickSbiAccount(accounts);
  const account = target ?? FALLBACK_ACCOUNT;

  const realized = ok(loaded.realized);
  const portfolio = ok(loaded.portfolio);
  const dividends = ok(loaded.dividends);
  const holdings = portfolio && loaded.portfolio ? sbiHoldings(portfolio, account.id, loaded.portfolio.asOf) : null;

  // 시세·환율: 투자신탁은 CSV 기준가라서 조회하지 않는다
  const symbols = holdings
    ? [...holdings.holdings.map((h) => h.quoteSymbol).filter((s) => !holdings.fundQuotes[s]), ...holdings.margins.map((m) => m.symbol)]
    : [];
  let market: MarketData | null = null;
  let noFx: string | null = null;
  try {
    market = await getQuoteService().get(symbols);
  } catch (err) {
    if (!(err instanceof NoFxError)) throw err;
    noFx = err.message;
  }
  const rates = market?.fx.rates ?? null;
  const ccy: Currency = rates && isCurrency(sp.ccy) ? sp.ccy : "JPY";
  const toCcy = (amount: number, from: Currency = "JPY") => (rates ? convert(amount, from, ccy, rates) : amount);
  const now = new Date();

  const valuation: SbiValuation | null =
    holdings && market && rates
      ? valueSbiHoldings(holdings, account, { ...withFallback(market.quotes, holdings.csvQuotes), ...holdings.fundQuotes }, rates, now)
      : null;
  const home = account.homeCurrency;

  // ── 총 누적손익 = 실현손익 + 평가손익 + 배당·분배금 ──
  const terms: { kind: SbiKind; value: number | null; from: Currency; note: string }[] = [
    { kind: "realized", value: realized?.total.pnl ?? null, from: "JPY", note: realized?.beforeTax === false ? "세후" : "세전" },
    valuation
      ? { kind: "portfolio", value: valuation.pnl, from: home, note: "현재가 기준" }
      : { kind: "portfolio", value: portfolio?.csvTotal?.pnl ?? null, from: "JPY", note: "CSV 받은 시점" },
    { kind: "dividends", value: dividends?.totalJpy ?? null, from: "JPY", note: "세후" },
  ];
  const present = terms.filter((t) => t.value !== null);
  const cumulative = present.length > 0 ? present.reduce((s, t) => s + toCcy(t.value as number, t.from), 0) : null;
  // 실현손익·배당 CSV 는 따로 넣으므로 기간이 어긋날 수 있다. 그대로 더하면 한쪽 기간 밖의 손익이 빠진다
  const periodIssue = sbiPeriodIssue(realized, dividends);

  const cards: ImportCardView[] = [
    card("realized", loaded.realized, (d) => ({
      headline: exactYen(d.total.pnl, true),
      headlineClass: directionClass(d.total.pnl),
      lines: [`${periodText(d.period)} 약정 · ${d.beforeTax ? "세전" : "세후"}`],
    })),
    card("portfolio", loaded.portfolio, (d) => {
      const pnl = valuation ? valuation.pnl : d.csvTotal?.pnl ?? null;
      const count = holdings?.holdings.length ?? 0;
      return {
        headline: pnl === null ? `${count}종목` : exactYen(valuation ? toYen(pnl, home, rates) : pnl, true),
        headlineClass: directionClass(pnl),
        lines: [
          `보유 ${count}종목${d.margins.length > 0 ? ` · 신용 ${d.margins.length}건` : ""} · ${valuation ? "지금 시세로 다시 계산" : "CSV 시점 값"}`,
          ...(d.csvTotal?.pnl != null ? [`받은 시점의 SBI 화면 含み損益 ${exactYen(d.csvTotal.pnl, true)}`] : []),
        ],
      };
    }),
    card("dividends", loaded.dividends, (d) => ({
      headline: exactYen(d.totalJpy, true),
      headlineClass: directionClass(d.totalJpy),
      lines: [`${periodText(d.period)} 입금 · 세후 · ${d.items.length}건`],
    })),
  ];

  const others = CURRENCIES.filter((c) => c !== ccy);
  const quoteTimes = market ? Object.values(market.quotes).map((q) => q.marketTime).filter(Boolean).sort() : [];

  return (
    <div className={styles.stack}>
      {/* ── 총 누적손익 ─────────────────────────── */}
      <section className={`panel ${styles.hero}`}>
        <div className={styles.controls}>
          {rates && (
            <nav className="segmented" aria-label="표시 통화">
              {CURRENCIES.map((c) => (
                <Link key={c} href={hrefWith("/sbi", sp, { ccy: c === "JPY" ? undefined : c })} aria-current={c === ccy}>
                  {CURRENCY_SUFFIX[c]}
                </Link>
              ))}
            </nav>
          )}
          <nav className="segmented" aria-label="표시 형식">
            <Link href={hrefWith("/sbi", sp, { fmt: undefined })} aria-current={fmt === "compact"}>
              간략
            </Link>
            <Link href={hrefWith("/sbi", sp, { fmt: "exact" })} aria-current={fmt === "exact"}>
              정확
            </Link>
          </nav>
          {holdings && (
            <div className={styles.refresh}>
              <span className="muted">
                시세 {quoteTimes.length > 0 ? `${timeText(quoteTimes[0])} ~ ${timeText(quoteTimes[quoteTimes.length - 1])}` : "—"}
              </span>
              <RefreshButton />
            </div>
          )}
        </div>

        <div className={styles.heroMain}>
          <h1 className={styles.heroLabel}>
            SBI証券 총 누적손익
            {present.length > 0 && present.length < 3 && <span className="pill">3개 중 {present.length}개 반영</span>}
            {periodIssue && <span className="pill pill-warn">{periodIssue.kind === "different" ? "CSV 기간 다름" : "CSV 기간 확인 불가"}</span>}
          </h1>
          {cumulative === null ? (
            <>
              <span className={`${styles.heroValue} muted`}>—</span>
              <p className={styles.lead}>
                SBI証券에서 CSV 세 개를 받아 아래 카드에 끌어다 놓으면, 지금까지 이 계좌에서 번 돈(또는 잃은 돈)을 한 번에 보여 드려요.
                하나만 넣어도 그 항목부터 채워집니다.
              </p>
            </>
          ) : (
            <>
              <span className={`${styles.heroValue} num ${directionClass(cumulative)}`} title={formatMoney(cumulative, ccy, "exact", { signed: true })}>
                {formatMoney(cumulative, ccy, fmt, { signed: true })}
              </span>
              {rates && (
                <span className={styles.heroOthers}>
                  {others.map((c, i) => (
                    <span key={c}>
                      {i > 0 && " · "}≈ {formatMoney(convert(cumulative, ccy, c, rates), c, fmt, { signed: true })}
                    </span>
                  ))}
                </span>
              )}
            </>
          )}
        </div>

        <ol className={styles.formula} aria-label="총 누적손익 = 실현손익 + 평가손익 + 배당·분배금">
          {terms.map((t, i) => (
            <Fragment key={t.kind}>
              {i > 0 && (
                <li className={styles.op} aria-hidden>
                  +
                </li>
              )}
              <li className={styles.term} data-kind={t.kind} data-empty={t.value === null || undefined}>
                <span className={styles.termLabel}>
                  <i aria-hidden />
                  {SBI_GUIDE[t.kind].title}
                </span>
                {t.value === null ? (
                  <span className={styles.termEmpty}>{SBI_GUIDE[t.kind].step}번 CSV를 넣으면 채워져요</span>
                ) : (
                  <span className={styles.termValue}>
                    <Money amount={toCcy(t.value, t.from)} currency={ccy} mode={fmt} signed colored />
                  </span>
                )}
                <span className={styles.termNote}>{t.value === null ? SBI_GUIDE[t.kind].jpTitle : t.note}</span>
              </li>
            </Fragment>
          ))}
        </ol>

        {valuation && (
          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>현재 평가액</span>
              <span className={styles.kpiValue}>
                <Money amount={toCcy(valuation.value, home)} currency={ccy} mode={fmt} />
              </span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>매입금액</span>
              <span className={styles.kpiValue}>
                <Money amount={toCcy(valuation.cost, home)} currency={ccy} mode={fmt} />
              </span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>평가수익률</span>
              <span className={styles.kpiValue}>
                <Pct rate={valuation.returnRate} />
              </span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>보유</span>
              <span className={styles.kpiValue}>
                {holdings?.holdings.length ?? 0}
                <span className={styles.kpiUnit}>종목</span>
                {valuation.margins.length > 0 && (
                  <span className={styles.kpiUnit}>
                    {" "}
                    · 신용 {valuation.margins.length}건
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ── 경고 ─────────────────────────────────── */}
      {(periodIssue || noFx || (market && (market.errors.length > 0 || market.fx.fromCache)) || (holdings && !target)) && (
        <div className={styles.notices}>
          {periodIssue?.kind === "different" && (
            <p className="notice">
              실현손익({periodText(periodIssue.realized)})과 배당·분배금({periodText(periodIssue.dividends)})의 기간이 달라, 총 누적손익은 서로 다른
              기간의 금액을 더한 값입니다. 두 CSV를 같은 기간(가장 처음부터 오늘까지)으로 받아 다시 넣으세요.
            </p>
          )}
          {periodIssue?.kind === "unknown" && (
            <p className="notice">
              실현손익({periodText(periodIssue.realized)})과 배당·분배금({periodText(periodIssue.dividends)}) 중 기간 정보가 없는 CSV가 있어 범위를
              비교할 수 없습니다. 총 누적손익이 서로 다른 기간의 금액을 더했을 수 있으니, 두 CSV를 같은 기간(가장 처음부터 오늘까지)으로 받아
              다시 넣으세요.
            </p>
          )}
          {noFx && (
            <p className="notice notice-danger">
              시세·환율을 받지 못해 평가손익은 CSV를 받은 시점의 값으로 보여 줍니다. 네트워크를 확인한 뒤 새로고침하세요. ({noFx})
            </p>
          )}
          {holdings && !target && (
            <p className="notice">
              SBI証券 계좌가 없어 이 보유종목은 대시보드 총자산에 들어가지 않습니다. <Link href="/holdings">계좌 추가하기</Link>
            </p>
          )}
          {market?.fx.fromCache && <p className="notice">환율을 새로 받지 못해 저장된 환율({timeText(market.fx.asOf)} 기준)을 씁니다.</p>}
          {market?.errors.map((e) => (
            <p key={e} className="notice">
              {e} — 이 종목은 CSV의 현재가로 계산했습니다.
            </p>
          ))}
        </div>
      )}

      {/* ── CSV 넣기 ─────────────────────────────── */}
      <section className={styles.importSection}>
        <div className={styles.sectionHead}>
          <h2>CSV 넣기</h2>
          <span className="muted">SBI証券에서 받은 CSV를 이 화면 아무 곳에나 끌어다 놓으세요. 여러 개를 한꺼번에 놓아도 됩니다.</span>
        </div>
        <SbiImport cards={cards} />
      </section>

      {/* ── 항목별 ───────────────────────────────── */}
      {valuation && holdings && loaded.portfolio && (
        <UnrealizedPanel
          valuation={valuation}
          csvTotal={portfolio?.csvTotal ?? null}
          asOf={loaded.portfolio.asOf}
          home={home}
          ccy={ccy}
          fmt={fmt}
          toCcy={toCcy}
          rates={rates}
        />
      )}
      {(realized || dividends) && (
        <div className={styles.detailGrid}>
          {realized && <RealizedPanel data={realized} ccy={ccy} fmt={fmt} toCcy={toCcy} />}
          {dividends && <DividendsPanel data={dividends} ccy={ccy} fmt={fmt} toCcy={toCcy} />}
        </div>
      )}

      <footer className={styles.footnotes}>
        <p>
          <strong>총 누적손익</strong> = 실현손익 + 평가손익 + 배당·분배금. 판 것, 들고 있는 것, 받은 것을 모두 더한 이 계좌의 성적표예요.
          실현손익은 세전, 배당·분배금은 세후 금액이라 SBI 화면의 어느 한 숫자와 정확히 같지는 않을 수 있습니다.
        </p>
        <p className="muted">
          평가손익은 CSV의 수량·취득단가에 지금 시세(15분마다 갱신)를 곱해 매번 새로 계산합니다. 투자신탁은 시세를 받을 수 없어 CSV의 기준가를,
          신용은 CSV 시점의 금리·수수료를 빼서 씁니다. 평가액에는 SBI 화면처럼 신용 建代金을 넣지 않습니다. 엔이 아닌 통화로 볼 때는 모두 현재
          환율로 바꿉니다.
        </p>
        <p className="muted">넣은 CSV는 이 컴퓨터의 data/sbi-imports.json 에만 저장됩니다.</p>
      </footer>
    </div>
  );
}

/** 계좌통화 금액 → 엔 (SBI 계좌는 보통 엔이라 그대로다) */
function toYen(amount: number, from: Currency, rates: FxRates | null): number {
  return rates ? convert(amount, from, "JPY", rates) : amount;
}

function card<T>(
  kind: SbiKind,
  entry: LoadedImport<T> | null,
  view: (data: T) => { headline: string; headlineClass: string; lines: string[] },
): ImportCardView {
  if (!entry) return { kind, loaded: null };
  const file = `${entry.meta.fileName} · ${timeText(entry.asOf)} ${entry.meta.fileModifiedAt ? "SBI에서 받음" : "가져옴"}`;
  if (!entry.parsed.ok) {
    return { kind, loaded: { headline: "", headlineClass: "", lines: [file], warnings: [], error: `저장해 둔 CSV를 읽지 못했습니다: ${entry.parsed.error}` } };
  }
  const v = view(entry.parsed.data);
  return { kind, loaded: { ...v, lines: [...v.lines, file], warnings: entry.parsed.warnings } };
}

type Display = { ccy: Currency; fmt: FormatMode; toCcy: (amount: number, from?: Currency) => number };

function PanelHead({ kind, children }: { kind: SbiKind; children: React.ReactNode }) {
  const guide = SBI_GUIDE[kind];
  return (
    <div className={styles.sectionHead}>
      <h2 className={styles.panelTitle} data-kind={kind}>
        <i aria-hidden />
        {guide.title} <span className={styles.jp}>{guide.jpTitle}</span>
      </h2>
      <span className="muted">{children}</span>
    </div>
  );
}

function PriceNote({ status, marketTime }: { status: PriceStatus; marketTime?: string }) {
  if (status === "imported") return <span className="pill">CSV{marketTime ? ` ${formatMonthDay(marketTime)}` : ""}</span>;
  if (status === "stale") return <span className="pill pill-warn">이전 시세</span>;
  if (status === "missing") return <span className="pill pill-danger">가격 미확인</span>;
  return null;
}

/** 같은 종목이 特定·NISA 에 나뉘어 있어도 한 종목으로 센다 */
const stockCount = (keys: readonly string[]) => new Set(keys).size;

function UnrealizedPanel(
  props: Display & {
    valuation: SbiValuation;
    csvTotal: { value: number | null; pnl: number | null } | null;
    asOf: string;
    home: Currency;
    rates: FxRates | null;
  },
) {
  const { valuation: v, csvTotal, asOf, home, ccy, fmt, toCcy, rates } = props;
  if (!rates) return null;
  const stocks = sumTotals(v.stocks, home, rates);
  const funds = sumTotals(v.funds, home, rates);
  const marginPnl = v.margins.reduce((s, m) => s + m.pnl, 0);
  const marginOpen = v.margins.reduce((s, m) => s + m.position.openPrice * m.position.quantity, 0);
  const money = (amount: number, signed = false) => <Money amount={toCcy(amount, home)} currency={ccy} mode={fmt} signed={signed} colored={signed} />;
  const count = (lots: readonly SbiLotEval[]) => stockCount(lots.map((e) => e.holding.quoteSymbol));

  return (
    <section className="panel">
      <PanelHead kind="portfolio">CSV의 수량·취득단가 × 지금 시세 · {CURRENCY_SUFFIX[ccy]} 기준</PanelHead>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>구분</th>
              <th className="r">평가액</th>
              <th className="r">매입금액</th>
              <th className="r">평가손익</th>
              <th className="r">수익률</th>
            </tr>
          </thead>
          <tbody>
            {v.stocks.length > 0 && (
              <ExpandRow
                colSpan={5}
                toggleLabel={`상세 · ${count(v.stocks)}종목`}
                head={
                  <>
                    일본주식 현물<span className="sub">{count(v.stocks)}종목 · 현재가는 Yahoo 시세</span>
                  </>
                }
                cells={
                  <>
                    <td className="r">{money(stocks.value)}</td>
                    <td className="r">{money(stocks.cost)}</td>
                    <td className="r">{money(stocks.pnl, true)}</td>
                    <td className="r">
                      <Pct rate={stocks.returnRate} />
                    </td>
                  </>
                }
              >
                <LotTable lots={v.stocks} money={money} />
              </ExpandRow>
            )}
            {v.funds.length > 0 && (
              <ExpandRow
                colSpan={5}
                toggleLabel={`상세 · ${count(v.funds)}종목`}
                head={
                  <>
                    투자신탁<span className="sub">{count(v.funds)}종목 · CSV 기준가({formatMonthDay(asOf)})</span>
                  </>
                }
                cells={
                  <>
                    <td className="r">{money(funds.value)}</td>
                    <td className="r">{money(funds.cost)}</td>
                    <td className="r">{money(funds.pnl, true)}</td>
                    <td className="r">
                      <Pct rate={funds.returnRate} />
                    </td>
                  </>
                }
              >
                <LotTable lots={v.funds} money={money} />
              </ExpandRow>
            )}
            {v.margins.length > 0 && (
              <ExpandRow
                colSpan={5}
                toggleLabel={`상세 · ${v.margins.length}건`}
                head={
                  <>
                    일본주식 신용
                    <span className="sub">
                      {v.margins.length}건 · 建代金 {formatMoney(toCcy(marginOpen), ccy, fmt)}은 평가액에 넣지 않음
                    </span>
                  </>
                }
                cells={
                  <>
                    <td className="r muted">—</td>
                    <td className="r muted">—</td>
                    <td className="r">
                      <Money amount={toCcy(marginPnl)} currency={ccy} mode={fmt} signed colored />
                    </td>
                    <td className="r">
                      <Pct rate={marginOpen > 0 ? marginPnl / marginOpen : null} />
                    </td>
                  </>
                }
              >
                <MarginTable margins={v.margins} ccy={ccy} fmt={fmt} toCcy={toCcy} />
              </ExpandRow>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th>합계</th>
              <td className="r">{money(v.value)}</td>
              <td className="r">{money(v.cost)}</td>
              <td className="r">{money(v.pnl, true)}</td>
              <td className="r">
                <Pct rate={v.returnRate} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {csvTotal?.value != null && csvTotal.pnl != null && (
        <p className={styles.compare}>
          CSV를 받았을 때({timeText(asOf)}) SBI 화면: 評価額 {exactYen(csvTotal.value)} · 含み損益 {exactYen(csvTotal.pnl, true)}
        </p>
      )}
    </section>
  );
}

/** 현물·투자신탁 상세: 같은 종목도 預り 구분(特定·NISA)마다 한 줄 */
function LotTable({ lots, money }: { lots: readonly SbiLotEval[]; money: (amount: number, signed?: boolean) => React.ReactNode }) {
  return (
    <table className={`data ${styles.nested}`}>
      <thead>
        <tr>
          <th>종목</th>
          <th className="r">수량</th>
          <th className="r">현재가 / 취득단가</th>
          <th className="r">평가액</th>
          <th className="r">평가손익</th>
          <th className="r">수익률</th>
        </tr>
      </thead>
      <tbody>
        {lots.map((e) => {
          const unit = e.holding.priceUnit;
          return (
            <tr key={e.holding.id}>
              <td>
                <span className={styles.stockName}>{e.holding.name}</span>
                <PriceNote status={e.priceStatus} marketTime={e.quote?.marketTime} />
                <span className="sub">{[unit ? null : e.holding.code, e.accountType].filter(Boolean).join(" · ")}</span>
              </td>
              <td className="r num">
                {formatQuantity(e.holding.quantity)}
                {unit ? "좌" : "주"}
              </td>
              <td className="r num">
                {e.price !== null ? formatUnitPrice(e.price, e.tradeCurrency) + perUnitsLabel(unit) : <span className="muted">—</span>}
                <span className="sub">{formatUnitPrice(e.holding.avgCost, e.tradeCurrency) + perUnitsLabel(unit)}</span>
              </td>
              <td className="r">{money(e.valueHome)}</td>
              <td className="r">{money(e.pnlHome, true)}</td>
              <td className="r">
                <Pct rate={e.returnHome} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** 신용 상세: 建玉마다 한 줄 (금액은 엔) */
function MarginTable({ margins, ccy, fmt, toCcy }: Display & { margins: readonly MarginEval[] }) {
  return (
    <table className={`data ${styles.nested}`}>
      <thead>
        <tr>
          <th>종목</th>
          <th className="r">수량</th>
          <th className="r">현재가 / 建単価</th>
          <th className="r">평가손익</th>
          <th className="r">수익률</th>
        </tr>
      </thead>
      <tbody>
        {margins.map((m) => (
          <tr key={`${m.symbol}-${m.position.openedAt}-${m.position.openPrice}`}>
            <td>
              <span className={styles.stockName}>{m.position.name}</span>
              <span className="pill">{m.position.side === "buy" ? "買建" : "売建"}</span> <PriceNote status={m.priceStatus} />
              <span className="sub">
                {m.position.code} · 信用 {m.position.term}
              </span>
            </td>
            <td className="r num">{formatQuantity(m.position.quantity)}주</td>
            <td className="r num">
              {m.price !== null ? formatUnitPrice(m.price, "JPY") : <span className="muted">—</span>}
              <span className="sub">{formatUnitPrice(m.position.openPrice, "JPY")}</span>
            </td>
            <td className="r">
              <Money amount={toCcy(m.pnl)} currency={ccy} mode={fmt} signed colored />
            </td>
            <td className="r">
              <Pct rate={m.pnl / (m.position.openPrice * m.position.quantity)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RealizedPanel({ data, ccy, fmt, toCcy }: Display & { data: SbiRealized }) {
  const money = (n: number | null, signed = false) =>
    n === null ? <span className="muted">—</span> : <Money amount={toCcy(n)} currency={ccy} mode={fmt} signed={signed} colored={signed} />;
  return (
    <section className="panel">
      <PanelHead kind="realized">
        {periodText(data.period)} 약정 · {data.beforeTax ? "세전" : "세후"}
      </PanelHead>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>상품</th>
              <th className="r">이익</th>
              <th className="r">손실</th>
              <th className="r">실현손익</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <ExpandRow
                key={r.product}
                colSpan={4}
                toggleLabel="상세"
                head={
                  <>
                    {productLabel(r.product)}
                    <span className="sub">{r.product}</span>
                  </>
                }
                cells={
                  <>
                    <td className="r">{money(r.profit)}</td>
                    <td className="r">{money(r.loss)}</td>
                    <td className="r">{money(r.pnl, true)}</td>
                  </>
                }
              >
                <p className={styles.expandNote}>
                  지금 넣은 実現損益 CSV에는 상품별 합계만 들어 있어서, 종목별·거래별 실현손익은 보여 드릴 수 없어요.
                </p>
              </ExpandRow>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>합계</th>
              <td className="r">{money(data.total.profit)}</td>
              <td className="r">{money(data.total.loss)}</td>
              <td className="r">{money(data.total.pnl, true)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/** 배당 수량 뒤에 붙이는 단위 (투자신탁은 단위를 몰라 붙이지 않는다) */
const shareUnit = (product: string) => (isFundProduct(product) ? "" : "주");

function DividendsPanel({ data, ccy, fmt, toCcy }: Display & { data: SbiDividends }) {
  const byYear = new Map<string, { amount: number; count: number }>();
  for (const it of data.items) {
    const y = it.date.slice(0, 4);
    const cur = byYear.get(y) ?? { amount: 0, count: 0 };
    byYear.set(y, { amount: cur.amount + it.amountJpy, count: cur.count + 1 });
  }
  const years = [...byYear].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(1, ...years.map(([, v]) => v.amount));
  const lastYear = data.period?.to.slice(0, 4);

  // 상품 → 종목별 합계. 합계 표에 없는 상품이 건별 표에만 있으면 뒤에 붙인다
  const stocks = groupDividendsByStock(data.items);
  const products = [...data.byProduct];
  for (const s of stocks) {
    if (products.some((p) => p.product === s.product)) continue;
    const amountJpy = stocks.filter((x) => x.product === s.product).reduce((sum, x) => sum + x.amountJpy, 0);
    products.push({ product: s.product, amountJpy, amountUsd: null });
  }
  const money = (n: number) => <Money amount={toCcy(n)} currency={ccy} mode={fmt} />;

  return (
    <section className="panel">
      <PanelHead kind="dividends">
        {periodText(data.period)} 입금 · 세후 · {data.items.length}건
      </PanelHead>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>상품</th>
              <th className="r">받은 금액</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const own = stocks.filter((s) => s.product === p.product);
              const head = (
                <>
                  {productLabel(p.product)}
                  <span className="sub">{p.product}</span>
                </>
              );
              const cells = (
                <td className="r">
                  {money(p.amountJpy)}
                  {p.amountUsd !== null && <span className="sub num">CSV의 USD 열 {formatMoney(p.amountUsd, "USD", "exact")}</span>}
                </td>
              );
              if (own.length === 0) {
                return (
                  <tr key={p.product}>
                    <td>{head}</td>
                    {cells}
                  </tr>
                );
              }
              return (
                <ExpandRow
                  key={p.product}
                  colSpan={2}
                  toggleLabel={`상세 · ${stockCount(own.map((s) => s.code ?? s.name))}종목`}
                  head={head}
                  cells={cells}
                >
                  <table className={`data ${styles.nested}`}>
                    <thead>
                      <tr>
                        <th>종목</th>
                        <th className="r">수량</th>
                        <th className="r">횟수</th>
                        <th className="r">받은 금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {own.map((s) => (
                        <ExpandRow
                          key={s.key}
                          colSpan={4}
                          toggleLabel="입금 내역"
                          head={
                            <>
                              <span className={styles.stockName}>{s.name}</span>
                              <span className="sub">
                                {[s.code, s.account].filter(Boolean).join(" · ")}
                                {s.otherNames.length > 0 && ` · 예전 이름 ${s.otherNames.join(", ")}`}
                              </span>
                            </>
                          }
                          cells={
                            <>
                              <td className="r num">
                                {s.quantity !== null ? `${formatQuantity(s.quantity)}${shareUnit(s.product)}` : "—"}
                                {new Set(s.items.map((it) => it.quantity)).size > 1 && <span className="sub">최근 입금 기준</span>}
                              </td>
                              <td className="r num">{s.items.length}회</td>
                              <td className="r">{money(s.amountJpy)}</td>
                            </>
                          }
                        >
                          <table className={`data ${styles.nested} ${styles.payments}`}>
                            <thead>
                              <tr>
                                <th>입금일</th>
                                <th className="r">수량</th>
                                <th className="r">1주당</th>
                                <th className="r">받은 금액</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.items.map((it, i) => {
                                const perShare = perShareJpy(it);
                                return (
                                  <tr key={`${it.date}-${i}`}>
                                    <td className="num">{ymd(it.date)}</td>
                                    <td className="r num">{it.quantity !== null ? `${formatQuantity(it.quantity)}${shareUnit(it.product)}` : "—"}</td>
                                    <td className="r num">{perShare !== null ? formatUnitPrice(toCcy(perShare), ccy) : <span className="muted">—</span>}</td>
                                    <td className="r">{money(it.amountJpy)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </ExpandRow>
                      ))}
                    </tbody>
                  </table>
                </ExpandRow>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th>합계</th>
              <td className="r">{money(data.totalJpy)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {years.length > 0 && (
        <>
          <h3 className={styles.subTitle}>연도별</h3>
          <ul className={styles.years}>
            {years.map(([y, v]) => (
              <li key={y}>
                <span className={styles.yearLabel}>
                  {y}
                  {y === lastYear && data.period && <span className="sub">~{ymd(data.period.to).slice(5)}</span>}
                </span>
                <span className={styles.yearBar} title={`${v.count}건`}>
                  <i style={{ width: `${(v.amount / max) * 100}%` }} />
                </span>
                <span className="num">{formatMoney(toCcy(v.amount), ccy, fmt)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
