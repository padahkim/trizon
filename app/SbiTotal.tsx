"use client";

import { useId } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney, formatUsdJpyRate } from "@/lib/format";
import type { YenSummary } from "@/lib/portfolio/evaluate";
import type { UsdJpyRate } from "@/lib/fx/types";

export default function SbiTotal({ summary, rate, loading }: { summary: YenSummary; rate?: UsdJpyRate; loading: boolean }) {
  const tooltipId = useId();
  const total = summary.total === undefined ? loading ? "환율 받는 중" : "환율 없음" : formatMoney(summary.total, "JPY");
  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger type="button" aria-label={`SBI증권 엔화 총액 ${total}, 엔화 환산 내역`} aria-describedby={tooltipId}
          className="inline-flex min-h-10 cursor-help flex-wrap items-baseline gap-2 rounded-sm text-figure-md tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          <span>{total}</span>
          <span className="text-caption text-ink-3 underline decoration-dotted underline-offset-4">엔화 환산</span>
        </TooltipTrigger>
        <TooltipContent id={tooltipId} side="bottom" align="start" className="min-w-64">
          <p className="text-label">SBI증권 엔화 환산 내역</p>
          <dl className="grid gap-2 tabular-nums">
            <div className="flex justify-between gap-6"><dt>일본주식</dt><dd>{formatMoney(summary.japaneseStocks, "JPY")}</dd></div>
            <div className="flex justify-between gap-6"><dt>투자신탁</dt><dd>{formatMoney(summary.funds, "JPY")}</dd></div>
            <div className="flex justify-between gap-6"><dt>미국주식 엔 환산</dt><dd>{summary.usYen === undefined ? "환율 없음" : formatMoney(summary.usYen, "JPY")}</dd></div>
            <div className="flex justify-between gap-6 border-t border-line pt-2 font-semibold"><dt>합계</dt><dd>{total}</dd></div>
          </dl>
          {rate && <p className="text-caption text-ink-2 tabular-nums">{formatUsdJpyRate(rate.yenPerDollar)}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
