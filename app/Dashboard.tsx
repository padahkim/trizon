"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMarketTime, formatMoney, formatUploadedAt } from "@/lib/format";
import { evaluate } from "@/lib/portfolio/evaluate";
import {
  backupSavedSnapshot,
  getSavedSnapshot,
  getServerSnapshot,
  STORAGE_UNAVAILABLE,
  subscribeSaved,
  writeSavedSnapshot,
} from "@/lib/portfolio/browser-store";
import { loadSaved, serializeSaved, type SavedV1 } from "@/lib/portfolio/saved";
import { importSbiFiles, type FileResult } from "@/lib/sbi/import";
import { SBI_UPLOAD_GUIDANCE } from "@/lib/sbi/guide";
import { holdingsFromTrades, usPositionKey, type UsBaselineInput, type UsHoldingBaseline, type UsPosition } from "@/lib/sbi/us-trades";
import PortfolioView, { Delta } from "./PortfolioView";
import Uploader from "./Uploader";
import UsBaselineEditor from "./UsBaselineEditor";
import { useQuotes } from "./useQuotes";

type BaselineChange = { position: UsPosition; value: UsHoldingBaseline | null };

function withBaselineChanges(saved: SavedV1, changes: BaselineChange[]): SavedV1 {
  if (!changes.length) return saved;
  const baselines = new Map(saved.sbiUsBaselines?.map((baseline) => [usPositionKey(baseline), baseline]));
  for (const change of changes) {
    const key = usPositionKey(change.position);
    if (change.value) baselines.set(key, change.value);
    else baselines.delete(key);
  }
  return { ...saved, sbiUsBaselines: [...baselines.values()] };
}

export default function Dashboard() {
  const [unsaved, setUnsaved] = useState<SavedV1>();
  const [pendingBaselines, setPendingBaselines] = useState<BaselineChange[]>([]);
  const subscribe = useCallback((onChange: () => void) => subscribeSaved(() => {
    // A stored snapshot replaces a temporary CSV import; manual changes are overlaid separately.
    setUnsaved(undefined);
    onChange();
  }), []);
  const raw = useSyncExternalStore(subscribe, getSavedSnapshot, getServerSnapshot);
  const loaded = useMemo(
    () => raw === undefined || raw === STORAGE_UNAVAILABLE ? null : loadSaved(raw),
    [raw],
  );
  const [now, setNow] = useState(() => new Date());
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [baselineTarget, setBaselineTarget] = useState<{ position?: UsPosition } | null>(null);
  const sourceSaved = unsaved ?? (loaded?.status === "ok" ? loaded.saved : undefined);
  const saved = useMemo(() => {
    if (!sourceSaved && !pendingBaselines.length) return undefined;
    return withBaselineChanges(sourceSaved ?? { version: 1 }, pendingBaselines);
  }, [sourceSaved, pendingBaselines]);
  const usHoldings = useMemo(
    () => holdingsFromTrades(saved?.sbiUsTrades?.trades ?? [], saved?.sbiUsBaselines),
    [saved?.sbiUsTrades?.trades, saved?.sbiUsBaselines],
  );
  const positions = useMemo(() => [...new Map([
    ...saved?.sbiUsTrades?.trades ?? [], ...saved?.sbiUsBaselines ?? [],
  ].map((position) => [usPositionKey(position), position])).values()], [saved?.sbiUsTrades?.trades, saved?.sbiUsBaselines]);
  const holdings = useMemo(
    () => [...saved?.sbiPortfolio?.holdings ?? [], ...usHoldings.holdings],
    [saved?.sbiPortfolio?.holdings, usHoldings.holdings],
  );
  const quotes = useQuotes(holdings);
  const portfolio = evaluate(quotes.failed ? holdings.map((holding) => ({ ...holding, csvQuote: undefined })) : holdings, quotes.quotes);
  const markets = portfolio.countries.flatMap((country) => country.brokers.flatMap((broker) => broker.markets));
  const totals = (["JPY", "USD"] as const).flatMap((currency) => {
    const total = portfolio.totals[currency];
    return total ? [{ currency, total }] : [];
  });
  const uploadedAt = [saved?.sbiPortfolio?.uploadedAt, saved?.sbiUsTrades?.uploadedAt]
    .filter((date): date is string => date !== undefined).sort().at(-1);

  function updateSaved(transform: (current: SavedV1) => SavedV1, changedPosition?: UsPosition): SavedV1 {
    // Read immediately before writing so another tab's unrelated sources are retained.
    const latest = getSavedSnapshot();
    const current = loadSaved(latest === STORAGE_UNAVAILABLE ? null : latest);
    const source = unsaved && latest === raw ? unsaved : current.status === "ok" ? current.saved : { version: 1 as const };
    const base = withBaselineChanges(source, pendingBaselines);
    const next = transform(base);
    if (next === base) return next;
    try {
      if (latest === STORAGE_UNAVAILABLE) throw new Error("storage unavailable");
      if (current.status === "unreadable" && latest !== null) backupSavedSnapshot(latest);
      writeSavedSnapshot(serializeSaved(next));
      setUnsaved(undefined);
      setPendingBaselines([]);
    } catch {
      setUnsaved(next);
      if (changedPosition) {
        const key = usPositionKey(changedPosition);
        const change = { position: changedPosition, value: next.sbiUsBaselines?.find((baseline) => usPositionKey(baseline) === key) ?? null };
        setPendingBaselines((changes) => [...changes.filter((item) => usPositionKey(item.position) !== key), change]);
      }
    }
    return next;
  }

  function saveBaseline(input: UsBaselineInput) {
    updateSaved((current) => {
      const baseline: UsHoldingBaseline = { ...input, includedTradeKeys: (current.sbiUsTrades?.trades ?? [])
        .filter((trade) => usPositionKey(trade) === usPositionKey(input)).map((trade) => trade.key) };
      return withBaselineChanges(current, [{ position: input, value: baseline }]);
    }, input);
  }

  function deleteBaseline(position: UsPosition) {
    const change = { position, value: null };
    updateSaved((current) => withBaselineChanges(current, [change]), position);
  }

  async function upload(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const incoming = await Promise.all(files.map(async (file) => ({
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })));
      const date = new Date();
      let filesResult: FileResult[] = [];
      const next = updateSaved((current) => {
        const imported = importSbiFiles(incoming, current, date);
        filesResult = imported.files;
        return imported.saved;
      });
      setNow(date);
      setResults(filesResult);
      if (next.sbiPortfolio?.holdings.length || next.sbiUsTrades?.trades.length) setUploaderOpen(false);
    } catch {
      setError("파일을 읽지 못했습니다. CSV를 다시 골라 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-(--container-max) flex-col gap-8 px-6 py-12">
      <header className="grid gap-2">
        <p className="text-title-md">trizon</p>
        <h1 className="text-title-lg">대시보드</h1>
      </header>
      {raw === undefined ? (
        <p role="status" className="text-body-md text-ink-2">불러오는 중</p>
      ) : (
        <>
          {raw === STORAGE_UNAVAILABLE && !unsaved && (
            <p role="alert" className="rounded-lg bg-danger-soft p-4 text-body-sm text-danger">
              저장된 데이터를 읽지 못했습니다. 브라우저의 저장 설정을 확인해 주세요.
            </p>
          )}
          {loaded?.status === "unreadable" && !unsaved && (
            <p role="alert" className="rounded-lg bg-danger-soft p-4 text-body-sm text-danger">
              저장된 데이터를 읽지 못했습니다. 기존 데이터는 보관하고 CSV를 다시 올려 주세요.
            </p>
          )}
          {(unsaved || pendingBaselines.length > 0) && (
            <p role="alert" className="rounded-lg bg-danger-soft p-4 text-body-sm text-danger">
              저장되지 않았습니다. 새로고침하면 저장하지 못한 변경사항이 사라집니다.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft p-4 text-body-sm text-danger">{error}</p>
          )}
          {quotes.failed && holdings.length > 0 && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-warning-soft px-4 py-3 text-body-sm">
              <div className="flex items-center gap-2">
                <TriangleAlert className="size-5 shrink-0 text-warning" strokeWidth={1.75} aria-hidden="true" />
                <p>시세를 받지 못했습니다. 모든 종목을 취득가로 표시합니다.</p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={quotes.loading} onClick={quotes.refresh}>
                {quotes.loading ? "받는 중" : "시세 새로고침"}
              </Button>
            </div>
          )}
          {totals.length > 0 && (
            <Card role="region" aria-label="자산 요약" className="bg-surface-summary">
              <CardHeader>
                <CardTitle>주식 자산</CardTitle>
                <CardDescription><Badge>현금 제외</Badge></CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <div className="grid gap-6 desktop:grid-cols-2">
                  {totals.map(({ currency, total }) => (
                    <div key={currency} className="grid gap-4">
                      <p className="text-label text-ink-2">{currency === "JPY" ? "엔" : "달러"} 자산</p>
                      <p className="text-figure-xl tabular-nums">{formatMoney(total.value, currency)}</p>
                      <dl className="grid grid-cols-2 gap-6 desktop:max-w-120">
                        <div className="grid gap-1">
                          <dt className="text-label text-ink-2">평가손익</dt>
                          <dd><Delta value={total.pnl} base={total.value - total.pnl} currency={currency} large /></dd>
                        </div>
                        <div className="grid gap-1">
                          <dt className="text-label text-ink-2">전일 대비</dt>
                          <dd><Delta value={total.dayChange} base={total.value - total.dayChange} currency={currency} large /></dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-caption text-ink-3">
                  {markets.map((market) => market.marketTime && (
                    <span key={market.market}>{formatMarketTime(market.market, market.marketTime)}</span>
                  ))}
                  {uploadedAt && (
                    <p>마지막 업로드 <time dateTime={uploadedAt}>{formatUploadedAt(uploadedAt, now)}</time></p>
                  )}
                  <Button type="button" variant="outline" className="ml-auto" disabled={quotes.loading} onClick={quotes.refresh}>
                    {quotes.loading ? "받는 중" : "시세 새로고침"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <section aria-labelledby="japan-brokers" className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 id="japan-brokers" className="text-title-lg">일본 증권사</h2>
              {totals.length > 0 && (
                <div aria-label="일본 증권사 소계" className="flex flex-wrap gap-6 text-figure-md tabular-nums">
                  {totals.map(({ currency, total }) => <span key={currency}>{formatMoney(total.value, currency)}</span>)}
                </div>
              )}
            </div>
            <Card role="region" aria-labelledby="sbi-broker">
              <CardHeader className="flex flex-wrap items-start justify-between gap-4">
                <div className="grid gap-1">
                  <CardTitle><h3 id="sbi-broker">SBI증권</h3></CardTitle>
                  <CardDescription>
                    {uploadedAt ? (
                      <>마지막 업로드 <time dateTime={uploadedAt}>{formatUploadedAt(uploadedAt, now)}</time></>
                    ) : "SBI증권에서 받은 CSV로 보유 주식을 확인합니다."}
                  </CardDescription>
                </div>
                {holdings.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    aria-expanded={uploaderOpen}
                    aria-controls={uploaderOpen ? "sbi-uploader" : undefined}
                    onClick={() => setUploaderOpen((open) => !open)}
                  >
                    CSV 올리기
                  </Button>
                )}
              </CardHeader>
              <CardContent className="grid gap-6">
                {holdings.length > 0 && !uploaderOpen && (
                  <p className="text-body-sm text-ink-2">{SBI_UPLOAD_GUIDANCE.reopen}</p>
                )}
                {(!holdings.length || uploaderOpen) && <Uploader onFiles={upload} busy={busy} />}
                {results.length > 0 && (
                  <div role="status">
                    <ul aria-label="업로드 결과" className="grid gap-2">
                      {results.map((file, index) => (
                        <li key={`${file.fileName}-${index}`} className="flex flex-wrap items-center gap-2 text-body-sm">
                          <Badge variant={file.error ? "error" : "success"}>{file.error ? "읽지 못함" : "반영됨"}</Badge>
                          <span>{file.fileName}</span>
                          <span className="text-ink-2">{file.error ?? (file.kind === "usTrades" ? "미국주식 거래를 누적했습니다." : "일본주식 보유를 교체했습니다.")}</span>
                          {file.notices.map((notice) => <span key={notice} className="text-ink-2">{notice}</span>)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <PortfolioView portfolio={portfolio} us={{ hasTrades: Boolean(saved?.sbiUsTrades), baselines: saved?.sbiUsBaselines ?? [], issues: usHoldings.issues, onEdit: (position) => setBaselineTarget({ position }) }}>
                  {baselineTarget && <UsBaselineEditor
                    key={baselineTarget.position ? usPositionKey(baselineTarget.position) : "new"}
                    positions={positions} baselines={saved?.sbiUsBaselines ?? []} holdings={usHoldings.holdings} issues={usHoldings.issues} initialPosition={baselineTarget.position}
                    onSave={saveBaseline} onDelete={deleteBaseline} onClose={() => setBaselineTarget(null)}
                  />}
                </PortfolioView>
              </CardContent>
            </Card>
          </section>
          <section aria-labelledby="korea-brokers" className="flex items-center gap-4 rounded-lg bg-surface-sunken px-6 py-4">
            <h2 id="korea-brokers" className="shrink-0 text-title-sm">한국 증권사</h2>
            <p className="text-body-sm text-ink-2">연결된 증권사 없음</p>
          </section>
        </>
      )}
    </main>
  );
}
