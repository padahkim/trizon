"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { usBaselineInputSchema, usPositionKey, type UsBaselineInput, type UsHoldingBaseline, type UsPosition } from "@/lib/sbi/us-trades";
import type { Holding } from "@/lib/portfolio/types";

type Draft = { ticker: string; name: string; account: string; quantity: string; avgCost: string };

function draftFor(position?: UsPosition, values?: Pick<Holding, "quantity" | "avgCost">): Draft {
  return { ticker: position?.ticker ?? "", name: position?.name ?? "", account: position?.account ?? "", quantity: values ? String(values.quantity) : "", avgCost: values ? String(values.avgCost) : "" };
}

export default function UsBaselineEditor({ positions, baselines, holdings, initialPosition, onSave, onDelete, onClose }: {
  positions: UsPosition[]; baselines: UsHoldingBaseline[]; holdings: Holding[]; initialPosition?: UsPosition;
  onSave: (baseline: UsBaselineInput) => void; onDelete: (position: UsPosition) => void; onClose: () => void;
}) {
  const findValues = (position?: UsPosition) => position && (holdings.find((holding) => holding.code === position.ticker && holding.account === position.account)
    ?? baselines.find((baseline) => usPositionKey(baseline) === usPositionKey(position)));
  const [draft, setDraft] = useState(() => draftFor(initialPosition, findValues(initialPosition)));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [editing, setEditing] = useState<UsPosition | undefined>(initialPosition);
  const [deleting, setDeleting] = useState<UsHoldingBaseline>();
  function edit(position?: UsPosition) {
    setDraft(draftFor(position, findValues(position)));
    setEditing(position);
    setErrors({});
  }
  const selected = positions.find((position) => position.ticker === draft.ticker && position.account === draft.account);
  const fields: { name: keyof Draft; label: string; lang?: string; type?: string }[] = [
    { name: "ticker", label: "종목 코드" }, { name: "name", label: "종목명" },
    { name: "account", label: "預り区分", lang: "ja" },
    { name: "quantity", label: "保有数量", lang: "ja", type: "number" }, { name: "avgCost", label: "取得単価(USD)", lang: "ja", type: "number" },
  ];
  return (
    <form aria-label="미국주식 보유정보 입력" noValidate className="grid gap-4 rounded-lg bg-surface p-6" onSubmit={(event) => {
      event.preventDefault();
      const parsed = usBaselineInputSchema.safeParse({ ...draft, quantity: draft.quantity.trim() ? Number(draft.quantity) : NaN, avgCost: draft.quantity.trim() && Number(draft.quantity) === 0 ? 0 : draft.avgCost.trim() ? Number(draft.avgCost) : NaN });
      if (!parsed.success) {
        const next: typeof errors = {};
        for (const issue of parsed.error.issues) next[issue.path[0] as keyof Draft] = issue.message;
        setErrors(next);
        return;
      }
      onSave(parsed.data);
      onClose();
    }}>
      <h5 className="text-title-sm">기준 보유정보 입력</h5>
      <p id="baseline-help" className="text-body-sm text-ink-2">최신 CSV를 먼저 올린 뒤, SBI 현재 화면의 보유수량과 달러 취득단가를 입력해 주세요.</p>
      <details className="text-body-sm text-ink-2">
        <summary className="flex w-fit cursor-pointer items-center gap-2 rounded-sm text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><Info className="size-4" aria-hidden="true" />CSV 업로드 순서 안내</summary>
        <div className="mt-2 grid gap-2 rounded-md border border-line p-4">
          <ol className="grid list-decimal gap-2 pl-5">
            <li>현재까지의 거래가 포함된 최신 <span lang="ja">約定履歴</span> CSV를 먼저 올려주세요. 기간을 나눠 받았다면 필요한 파일을 모두 올려주세요.</li>
            <li>SBI 현재 화면의 <span lang="ja">保有数量・取得単価(USD)</span>를 확인하고 입력해 주세요. 확인하는 동안 추가 매매가 생겼다면 CSV부터 다시 확인해 주세요.</li>
            <li>이후에도 새 거래가 포함된 최신 CSV를 올려주세요. 이미 올린 거래는 다시 더하지 않습니다.</li>
          </ol>
          <p>예전 기간의 CSV를 나중에 추가했다면 SBI 현재 보유정보를 다시 입력해 주세요.</p>
        </div>
      </details>
      <div className="grid gap-2">
        <Label htmlFor="baseline-position">종목·계좌 선택</Label>
        <select id="baseline-position" value={selected ? usPositionKey(selected) : "new"} className="h-10 rounded-md border border-line-strong bg-surface-raised px-3 text-body-md" onChange={(event) => {
          const position = positions.find((item) => usPositionKey(item) === event.target.value);
          edit(position);
        }}>
          <option value="new">새 종목 직접 입력</option>
          {positions.map((position) => <option key={usPositionKey(position)} value={usPositionKey(position)} lang="ja">{position.name} ({position.ticker} · {position.account})</option>)}
        </select>
      </div>
      <div className="grid gap-4 tablet:grid-cols-2">
        {fields.map(({ name, label, lang, type = "text" }) => (
          <div key={name} className={`grid content-start gap-2${name === "account" ? " tablet:col-span-2" : ""}`}>
            <Label htmlFor={`baseline-${name}`} lang={lang}>{label}</Label>
            <Input id={`baseline-${name}`} type={type} lang={name === "name" || name === "account" ? "ja" : undefined} className={type === "number" ? "tabular-nums" : undefined} value={draft[name]} readOnly={Boolean(editing) && (name === "ticker" || name === "account")} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `baseline-${name}-error` : "baseline-help"} onChange={(event) => setDraft({ ...draft, [name]: event.target.value })} />
            {errors[name] && <p id={`baseline-${name}-error`} className="text-caption text-danger">{errors[name]}</p>}
          </div>
        ))}
      </div>
      <p className="text-caption text-ink-2">계좌구분은 SBI의 <span lang="ja">預り区分</span>(예: <span lang="ja">特定・一般・NISA</span>)과 동일하게 입력해 주세요. 0주는 보유표에서 숨기며, 기존 CSV 거래는 보관합니다.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>취소</Button>
        <Button type="submit">보유정보 저장</Button>
      </div>
      {baselines.length > 0 && <section aria-label="입력한 기준 보유정보" className="grid gap-3 border-t border-line pt-4">
        <h6 className="text-title-sm">입력한 기준 보유정보</h6>
        <ul className="grid gap-3">
          {baselines.map((baseline) => <li key={usPositionKey(baseline)} className="flex flex-wrap items-center justify-between gap-3 text-body-sm">
            <div className="grid gap-1">
              <span lang="ja">{baseline.name} ({baseline.ticker} · {baseline.account})</span>
              <span className="text-caption text-ink-2 tabular-nums">{baseline.quantity.toLocaleString("en-US")}주 · {formatMoney(baseline.avgCost, "USD")}</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" aria-label={`${baseline.ticker} ${baseline.account} 기준 보유정보 수정`} onClick={() => edit(baseline)}>수정</Button>
              <Button type="button" variant="outline" size="sm" aria-label={`${baseline.ticker} ${baseline.account} 기준 보유정보 삭제`} onClick={() => setDeleting(baseline)}>삭제</Button>
            </div>
          </li>)}
        </ul>
      </section>}
      <AlertDialog open={Boolean(deleting)} title="기준 보유정보를 삭제할까요?" description={<>선택한 기준값만 삭제하고 기존 CSV 거래로 다시 계산합니다. 과거 매수가 부족하면 계산할 수 없다는 경고가 다시 나타날 수 있습니다.</>} confirmLabel="기준 보유정보 삭제" onCancel={() => setDeleting(undefined)} onConfirm={() => {
        if (deleting) onDelete(deleting);
        if (deleting && editing && usPositionKey(deleting) === usPositionKey(editing)) edit();
        setDeleting(undefined);
      }} />
    </form>
  );
}
