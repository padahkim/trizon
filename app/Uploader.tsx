"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { SBI_GUIDES, SBI_UPLOAD_GUIDANCE } from "@/lib/sbi/guide";

export default function Uploader({ onFiles, busy }: {
  onFiles: (files: File[]) => Promise<void>; busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      id="sbi-uploader"
      className="grid gap-4 rounded-lg border border-dashed border-line-strong bg-surface p-6"
    >
      <h4 className="text-title-sm">CSV 올리기 안내</h4>
      <p className="text-body-md text-ink-2">{SBI_UPLOAD_GUIDANCE.introduction}</p>
      <ul aria-label="받을 CSV" className="grid gap-6 tablet:grid-cols-2">
        {SBI_GUIDES.map((guide) => (
          <li key={guide.kind} className="grid content-start justify-items-start gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h5 lang="ja" className="rounded-xs bg-surface-sunken px-2 py-1 text-name-ja">{guide.name}</h5>
              <span className="text-caption text-ink-2">{guide.availability}</span>
            </div>
            <p className="text-body-sm">{guide.description}</p>
            <ol aria-label={`${guide.name} 다운로드 순서`} className="grid list-decimal gap-2 pl-5 text-body-sm">
              {guide.steps.map((step) => (
                <li key={step.menu}>
                  <span lang="ja" className="text-name-ja">{step.menu}</span>
                  <p className="text-ink-2">{step.detail}</p>
                </li>
              ))}
            </ol>
            <a
              href={guide.helpUrl}
              target="_blank"
              rel="noreferrer"
              className="text-body-sm text-brand underline underline-offset-4 hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              SBI 공식 다운로드 도움말 (새 창)
            </a>
          </li>
        ))}
      </ul>
      <div>
        <label htmlFor="sbi-csv" className="sr-only">SBI CSV 파일</label>
        <input
          ref={input}
          id="sbi-csv"
          type="file"
          accept=".csv"
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
        <p className="mt-2 text-caption text-ink-3">{SBI_UPLOAD_GUIDANCE.selection}</p>
      </div>
    </div>
  );
}
