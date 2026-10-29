import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import {
  Table, TableBody, TableCaption, TableCell, TableFooter,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatMarketTime, formatMoney, formatPercent, formatUploadedAt } from "@/lib/format";
import type { Portfolio } from "@/lib/portfolio/evaluate";
import { marketCurrency, type Currency } from "@/lib/portfolio/types";
import { SBI_UPLOAD_GUIDANCE } from "@/lib/sbi/guide";
import { usPositionKey, type UsHoldingBaseline, type UsHoldingIssue, type UsPosition } from "@/lib/sbi/us-trades";

export function Delta({ value, base, currency, large = false }: {
  value: number; base: number; currency: Currency; large?: boolean;
}) {
  const text = formatMoney(value, currency, true);
  const color = text.startsWith("+") ? "text-rise" : text.startsWith("-") ? "text-fall" : "text-flat";
  return (
    <span className={`flex flex-col gap-0.5 tabular-nums ${color}`}>
      <span className={large ? "text-figure-lg" : "text-body-sm"}>{text}</span>
      <span className="text-caption">{formatPercent(base === 0 ? 0 : value / base * 100)}</span>
    </span>
  );
}

export default function PortfolioView({ portfolio, hasPortfolio, jpNotices = [], us, children, now, usYenRate }: {
  portfolio: Portfolio; hasPortfolio: boolean; jpNotices?: string[]; children?: ReactNode; now: Date; usYenRate?: number;
  us: { hasTrades: boolean; baselines: UsHoldingBaseline[]; issues: UsHoldingIssue[]; onEdit: (position?: UsPosition) => void };
}) {
  const markets = portfolio.countries.flatMap((country) => country.brokers.flatMap((broker) => broker.markets.map((market) => ({ key: `${country.country}-${broker.broker}-${market.market}-${market.assetType}`, market }))));
  if (hasPortfolio && !markets.some(({ market }) => market.market === "JP" && market.assetType === "stock")) {
    markets.unshift({ key: "JP-SBI-JP-stock", market: { market: "JP", assetType: "stock", totals: {}, rows: [] } });
  }
  // Keep the US block visible for upload guidance and uncomputable positions too.
  if (!markets.some(({ market }) => market.market === "US")) {
    markets.push({ key: "JP-SBI-US-stock", market: { market: "US", assetType: "stock", totals: {}, rows: [] } });
  }
  return markets.map(({ key, market }) => {
    const isUsYen = market.market === "US" && usYenRate !== undefined;
    const factor = isUsYen ? usYenRate : 1;
    const currency = isUsYen ? "JPY" : marketCurrency[market.market];
    const isFund = market.assetType === "fund";
    const title = isFund ? "투자신탁" : { JP: "일본주식", US: "미국주식", KR: "한국주식" }[market.market];
    const headingId = `market-${market.market}-${market.assetType}`;
    const fundUploadedAt = isFund ? market.rows.find((row) => row.holding.csvQuote)?.holding.csvQuote?.asOf : undefined;
    const total = market.totals[marketCurrency[market.market]];
    return (
      <section key={key} aria-labelledby={headingId} className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 id={headingId} className="text-title-sm">{title}</h4>
          {market.market === "US" && us.hasTrades && (
            <Badge variant="warning"><span lang="ja">約定履歴</span>으로 추정한 값</Badge>
          )}
          {market.marketTime && <span className="text-caption text-ink-3">{formatMarketTime(market.market, market.marketTime)}</span>}
          {isUsYen && <Badge variant="warning">엔 환산 · 환차손익 제외</Badge>}
          {fundUploadedAt && <span className="text-caption text-ink-3">CSV 업로드 <time dateTime={fundUploadedAt}>{formatUploadedAt(fundUploadedAt, now)}</time></span>}
          {market.rows.some((row) => row.priceSource === "csv") && (
            <Badge variant="warning">{isFund ? "CSV 기준가" : <>CSV <span lang="ja" className="ml-1">現在値</span></>}</Badge>
          )}
          {market.market === "US" && <Button type="button" variant="outline" className="ml-auto" onClick={() => us.onEdit()}>보유정보 입력·관리</Button>}
        </div>
        {isFund && (
          <p className="text-caption text-ink-2">투자신탁은 CSV 기준가로 평가합니다. 새 기준가는 <span lang="ja">ポートフォリオ</span> CSV를 다시 올려 반영합니다.</p>
        )}
        {market.market === "JP" && !isFund && jpNotices.length > 0 && (
          <ul aria-label="일본주식 계산 안내" className="grid gap-2 text-body-sm">
            {jpNotices.map((notice) => {
              const isWarning = notice.includes("만 들어 있습니다") || notice.includes("総件数") || notice.includes("잘린");
              return isWarning ? (
                <li key={notice} role="alert" className="flex items-center gap-2 rounded-lg bg-warning-soft p-4 text-warning-text">
                  <TriangleAlert className="size-5 shrink-0 text-warning" strokeWidth={1.75} aria-hidden="true" />
                  <p>{notice}</p>
                </li>
              ) : (
                <li key={notice} className="rounded-lg bg-surface-sunken p-4 text-ink-2">
                  {notice}
                </li>
              );
            })}
          </ul>
        )}
        {market.market === "US" && us.issues.length > 0 && (
          <ul aria-label="미국주식 계산 안내" className="grid gap-2 rounded-lg bg-warning-soft p-4 text-body-sm text-warning-text">
            {us.issues.map((issue) => <li key={usPositionKey(issue)} className="flex flex-wrap items-center gap-2">
              <span><span lang="ja">{issue.name} ({issue.ticker} · {issue.account})</span>: {issue.message}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => us.onEdit(issue)}>보유정보 입력</Button>
            </li>)}
          </ul>
        )}
        {market.market === "US" && children}
        {total ? <Table>
          <TableCaption className="sr-only">{title} 보유 종목</TableCaption>
          <TableHeader>
            <TableRow>
              {["종목", isFund ? "보유수량(口)" : "보유수량", isFund ? "취득단가(1만口)" : "취득단가", isFund ? "기준가(1만口)" : "현재가", "평가액", "평가손익", "전일 대비"].map((label, index) => (
                <TableHead key={label} scope="col" className={index === 3 ? "text-center" : undefined}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {market.rows.map((row) => (
              <TableRow key={`${row.holding.broker}-${row.holding.account}-${row.holding.market}-${row.holding.code}`}>
                <TableCell>
                  <div className="grid justify-items-start gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span lang="ja" className="text-name-ja">{row.holding.name}</span>
                      <Badge variant="outline" lang="ja" className="py-0">{row.holding.account}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-caption text-ink-3">
                      {!isFund && <span>{row.holding.code}</span>}
                      {market.market === "US" && us.baselines.some((baseline) => baseline.ticker === row.holding.code && baseline.account === row.holding.account) && <span>직접 입력</span>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{row.holding.quantity.toLocaleString("en-US")}{isFund && "口"}</TableCell>
                <TableCell>{formatMoney(row.holding.avgCost * factor, currency)}</TableCell>
                <TableCell>
                  {row.priceSource === "cost" ? (
                    <div className="flex min-h-5 items-center justify-center">
                      <Badge variant="warning" className="py-0 text-body-sm">시세 없음</Badge>
                    </div>
                  ) : (
                    <div className="grid justify-items-end gap-0.5">
                      <span>{formatMoney(row.price * factor, currency)}</span>
                      {row.priceSource === "csv" && (
                        <Badge variant="warning" className="py-0">{isFund ? "CSV 기준가" : <>CSV <span lang="ja" className="ml-1">現在値</span></>}</Badge>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>{formatMoney(row.value * factor, currency)}</TableCell>
                <TableCell><Delta value={row.pnl * factor} base={(row.value - row.pnl) * factor} currency={currency} /></TableCell>
                <TableCell><Delta value={row.dayChange * factor} base={(row.value - row.dayChange) * factor} currency={currency} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>{title} 합계</TableCell>
              <TableCell>{formatMoney(total.value * factor, currency)}</TableCell>
              <TableCell><Delta value={total.pnl * factor} base={(total.value - total.pnl) * factor} currency={currency} /></TableCell>
              <TableCell><Delta value={total.dayChange * factor} base={(total.value - total.dayChange) * factor} currency={currency} /></TableCell>
            </TableRow>
          </TableFooter>
        </Table> : (
          <p className="text-body-sm text-ink-2">
            {market.market === "JP" ? "보유 없음" : us.hasTrades || us.baselines.length > 0 ? "보유 중인 미국주식이 없습니다." : <><span lang="ja">約定履歴</span>{SBI_UPLOAD_GUIDANCE.usTradesEmpty}</>}
          </p>
        )}
      </section>
    );
  });
}
