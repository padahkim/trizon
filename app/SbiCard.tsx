"use client";

import { useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SBI_UPLOAD_GUIDANCE } from "@/lib/sbi/guide";

export default function SbiCard({ children, onFiles, busy }: {
  children: ReactNode; onFiles: (files: File[]) => Promise<void>; busy: boolean;
}) {
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const active = dragging && !busy;

  return (
    <Card
      role="region"
      aria-labelledby="sbi-broker"
      aria-busy={busy}
      className={`relative ${active ? "outline-2 outline-offset-2 outline-brand" : ""}`}
      onDragEnter={(event) => {
        if (busy || !event.dataTransfer.types.includes("Files")) return;
        depth.current++;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = busy ? "none" : "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        const files = Array.from(event.dataTransfer.files);
        if (!busy && files.length) void onFiles(files);
      }}
    >
      {children}
      {active && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl bg-brand-soft/90 p-6">
          <div role="status" className="grid justify-items-center gap-2 text-center text-brand">
            <Upload className="size-6" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-title-sm">{SBI_UPLOAD_GUIDANCE.dropPrompt}</p>
            <p className="text-body-sm">{SBI_UPLOAD_GUIDANCE.dropHelp}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
