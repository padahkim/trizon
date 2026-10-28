"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SBI_GUIDES } from "@/lib/sbi/guide";

export default function Uploader({ onFiles, busy }: {
  onFiles: (files: File[]) => Promise<void>; busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      id="sbi-uploader"
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!busy) void onFiles(Array.from(event.dataTransfer.files));
      }}
      className={`grid gap-4 rounded-lg border border-dashed bg-surface p-6 ${dragging ? "border-ink" : "border-line-strong"}`}
    >
      <h4 className="text-title-sm">CSV 올리기 안내</h4>
      <p className="text-body-md text-ink-2">아래 두 CSV를 SBI증권 사이트에서 받습니다.</p>
      <ul aria-label="받을 CSV" className="grid gap-6 tablet:grid-cols-2">
        {SBI_GUIDES.map((guide) => (
          <li key={guide.kind} className="grid content-start justify-items-start gap-2">
            <h5 lang="ja" className="rounded-xs bg-surface-sunken px-2 py-1 text-name-ja">{guide.name}</h5>
            <p className="text-body-sm">{guide.description}</p>
            <p className="text-body-sm text-ink-2">
              받는 곳: <a
                href={guide.helpUrl}
                lang="ja"
                target="_blank"
                rel="noreferrer"
                className="text-name-ja text-brand underline underline-offset-4 hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {guide.path.join(" › ")}
              </a>
            </p>
          </li>
        ))}
      </ul>
      <div>
        <label htmlFor="sbi-csv" className="sr-only">SBI CSV 파일</label>
        <input
          ref={input}
          id="sbi-csv"
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            void onFiles(files);
          }}
        />
        <Button type="button" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "읽는 중" : "CSV 고르기"}
        </Button>
        <p className="mt-2 text-caption text-ink-3">여러 파일을 고르거나 이곳에 끌어다 놓습니다.</p>
      </div>
    </div>
  );
}
