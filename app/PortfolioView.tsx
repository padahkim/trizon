import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import {
  Table, TableBody, TableCaption, TableCell, TableFooter,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatMarketTime, formatMoney, formatPercent } from "@/lib/format";
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
    <span className={`flex flex-col tabular-nums ${color}`}>
      <span className={large ? "text-figure-lg" : "text-body-sm"}>{text}</span>
      <span className="text-caption">{formatPercent(base === 0 ? 0 : value / base * 100)}</span>
    </span>
  );
}

export default function PortfolioView({ portfolio, us, children }: {
  portfolio: Portfolio; children?: ReactNode;
  us: { hasTrades: boolean; baselines: UsHoldingBaseline[]; issues: UsHoldingIssue[]; onEdit: (position?: UsPosition) => void };
}) {
  const markets = portfolio.countries.flatMap((country) => country.brokers.flatMap((broker) => broker.markets.map((market) => ({ key: `${country.country}-${broker.broker}-${market.market}`, market }))));
  // Keep the US block visible for upload guidance and uncomputable positions too.
  if (!markets.some(({ market }) => market.market === "US")) {
    markets.push({ key: "JP-SBI-US", market: { market: "US", totals: {}, rows: [] } });
  }
  return markets.map(({ key, market }) => {
    const currency = marketCurrency[market.market];
    const title = { JP: "일본주식", US: "미국주식", KR: "한국주식" }[market.market];
    const total = market.totals[currency];
    return (
      <section key={key} aria-labelledby={`market-${market.market}`} className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 id={`market-${market.market}`} className="text-title-sm">{title}</h4>
          {market.market === "US" && us.hasTrades && (
            <Badge variant="warning"><span lang="ja">約定履歴</span>으로 추정한 값</Badge>
          )}
          {market.marketTime && <span className="text-caption text-ink-3">{formatMarketTime(market.market, market.marketTime)}</span>}
          {market.rows.some((row) => row.priceSource === "csv") && (
            <Badge variant="warning">CSV <span lang="ja" className="ml-1">現在値</span></Badge>
          )}
          {market.market === "US" && <Button type="button" variant="outline" className="ml-auto" onClick={() => us.onEdit()}>보유정보 입력·관리</Button>}
        </div>
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
              {["종목", "보유수량", "취득단가", "현재가", "평가액", "평가손익", "전일 대비"].map((label) => (
                <TableHead key={label} scope="col">{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {market.rows.map((row) => (
              <TableRow key={`${row.holding.broker}-${row.holding.account}-${row.holding.market}-${row.holding.code}`}>
                <TableCell>
                  <div className="grid justify-items-start">
                    <span lang="ja" className="text-name-ja">{row.holding.name}</span>
                    {market.market === "US" && us.baselines.some((baseline) => baseline.ticker === row.holding.code && baseline.account === row.holding.account) && <span className="text-caption text-ink-3">직접 입력</span>}
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-ink-3">{row.holding.code}</span>
                      <Badge variant="outline" lang="ja" className="py-0">{row.holding.account}</Badge>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{row.holding.quantity.toLocaleString("en-US")}</TableCell>
                <TableCell>{formatMoney(row.holding.avgCost, currency)}</TableCell>
                <TableCell>
                  <div className="grid justify-items-end">
                    <span>{row.priceSource === "cost" ? "—" : formatMoney(row.price, currency)}</span>
                    {row.priceSource !== "quote" && (
                      <Badge variant="warning" className="py-0">
                        {row.priceSource === "csv" ? <>CSV <span lang="ja" className="ml-1">現在値</span></> : "시세 없음"}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{formatMoney(row.value, currency)}</TableCell>
                <TableCell><Delta value={row.pnl} base={row.holding.avgCost * row.holding.quantity} currency={currency} /></TableCell>
                <TableCell><Delta value={row.dayChange} base={row.value - row.dayChange} currency={currency} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>{title} 합계</TableCell>
              <TableCell>{formatMoney(total.value, currency)}</TableCell>
              <TableCell><Delta value={total.pnl} base={total.value - total.pnl} currency={currency} /></TableCell>
              <TableCell><Delta value={total.dayChange} base={total.value - total.dayChange} currency={currency} /></TableCell>
            </TableRow>
          </TableFooter>
        </Table> : (
          <p className="text-body-sm text-ink-2">
            {us.hasTrades || us.baselines.length > 0 ? "보유 중인 미국주식이 없습니다." : <><span lang="ja">約定履歴</span>{SBI_UPLOAD_GUIDANCE.usTradesEmpty}</>}
          </p>
        )}
      </section>
    );
  });
}
