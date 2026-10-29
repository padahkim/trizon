import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMarketTime, formatMoney, formatUploadedAt } from "@/lib/format";
import type { Portfolio } from "@/lib/portfolio/evaluate";
import type { UsdJpyRate } from "@/lib/fx/types";
import { Delta } from "./PortfolioView";

export default function AssetSummary({ portfolio, rate, rateLoading, rateFailed, onRetryRate, showUsInYen, onToggleUsCurrency, loading, onRefresh, uploadedAt, now }: {
  portfolio: Portfolio; rate?: UsdJpyRate; rateLoading: boolean; rateFailed: boolean; onRetryRate: () => void;
  showUsInYen: boolean; onToggleUsCurrency: () => void; loading: boolean; onRefresh: () => void; uploadedAt?: string; now: Date;
}) {
  const yen = portfolio.yenSummary;
  const japanese = portfolio.totals.JPY;
  const us = portfolio.totals.USD;
  const usFactor = showUsInYen && rate ? rate.yenPerDollar : 1;
  const usCurrency = showUsInYen && rate ? "JPY" : "USD";
  const markets = portfolio.countries.flatMap((country) => country.brokers.flatMap((broker) => broker.markets));
  return (
    <Card role="region" aria-label="자산 요약" className="bg-surface-summary">
      <CardHeader>
        <CardTitle>총자산 · 엔화</CardTitle>
        <CardDescription><Badge>현금 제외</Badge></CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div role="group" aria-label="엔화 총자산" className="grid gap-2">
          <p className="text-figure-xl tabular-nums">{yen.total === undefined ? <span className="text-title-lg text-ink-2">{rateLoading ? "환율 받는 중" : "환율 없음"}</span> : formatMoney(yen.total, "JPY")}</p>
          <p className="text-caption text-ink-2">일본 엔 총자산 + 미국주식 엔 환산액{yen.usYen !== undefined && us ? ` (${formatMoney(yen.usYen, "JPY")})` : ""}</p>
        </div>
        <div className="grid gap-6 border-t border-line pt-6 desktop:grid-cols-2">
          <div role="group" aria-label="일본 엔 총자산" className="grid content-start gap-4">
            <p className="text-label text-ink-2">일본 엔 총자산</p>
            <p className="text-figure-md tabular-nums">{formatMoney(yen.japan, "JPY")}</p>
            <p className="text-caption text-ink-2 tabular-nums">일본주식 {formatMoney(yen.japaneseStocks, "JPY")} + 투자신탁 {formatMoney(yen.funds, "JPY")}</p>
            {japanese && <dl className="grid grid-cols-2 gap-6">
              <div className="grid gap-1"><dt className="text-label text-ink-2">평가손익</dt><dd><Delta value={japanese.pnl} base={japanese.value - japanese.pnl} currency="JPY" large /></dd></div>
              <div className="grid gap-1"><dt className="text-label text-ink-2">전일 대비</dt><dd><Delta value={japanese.dayChange} base={japanese.value - japanese.dayChange} currency="JPY" large /></dd></div>
            </dl>}
          </div>
          {us && <div role="group" aria-label="미국주식 자산" className="grid content-start gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-label text-ink-2">미국주식 · {usCurrency === "JPY" ? "엔 환산" : "달러"}</p>
              <Button type="button" variant="outline" size="sm" disabled={!rate} aria-pressed={showUsInYen} onClick={onToggleUsCurrency}>{showUsInYen ? "달러로 표시" : "엔으로 표시"}</Button>
            </div>
            <p className="text-figure-md tabular-nums">{formatMoney(us.value * usFactor, usCurrency)}</p>
            <dl className="grid grid-cols-2 gap-6">
              <div className="grid gap-1"><dt className="text-label text-ink-2">평가손익</dt><dd><Delta value={us.pnl * usFactor} base={(us.value - us.pnl) * usFactor} currency={usCurrency} large /></dd></div>
              <div className="grid gap-1"><dt className="text-label text-ink-2">전일 대비</dt><dd><Delta value={us.dayChange * usFactor} base={(us.value - us.dayChange) * usFactor} currency={usCurrency} large /></dd></div>
            </dl>
            {showUsInYen && <p className="text-caption text-ink-2">현재 환율로 환산한 금액입니다. 환차손익은 포함하지 않습니다.</p>}
          </div>}
        </div>
        {us && rate && <div className="flex flex-wrap gap-4 text-caption text-ink-2 tabular-nums">
          <span>1 USD = {rate.yenPerDollar.toLocaleString("en-US", { maximumFractionDigits: 4 })} JPY</span>
          <span>Yahoo Finance</span>
          <span>환율 시각 <time dateTime={rate.asOf}>{new Date(rate.asOf).toLocaleString("ko-KR", { timeZone: "Asia/Tokyo" })}</time> (일본)</span>
        </div>}
        {us && rateFailed && <Alert variant="warning">
          <TriangleAlert strokeWidth={1.75} aria-hidden="true" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>환율을 받지 못했습니다. 미국주식은 달러로 표시합니다.</span>
            <Button type="button" variant="outline" size="sm" disabled={rateLoading} onClick={onRetryRate}>환율 다시 조회</Button>
          </AlertDescription>
        </Alert>}
        <div className="flex flex-wrap items-center gap-4 text-caption text-ink-3">
          {markets.map((market) => market.marketTime && <span key={market.market}>{formatMarketTime(market.market, market.marketTime)}</span>)}
          {uploadedAt && <p>마지막 업로드 <time dateTime={uploadedAt}>{formatUploadedAt(uploadedAt, now)}</time></p>}
          <Button type="button" variant="outline" className="ml-auto" disabled={loading} onClick={onRefresh}>{loading ? "받는 중" : "시세 새로고침"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
