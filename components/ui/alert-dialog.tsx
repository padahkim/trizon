"use client";

import { useRef, type ReactNode } from "react";
import { AlertDialog as Primitive } from "@base-ui/react/alert-dialog";
import { Button } from "@/components/ui/button";

// shadcn AlertDialog parts, composed with DESIGN.md's confirmation behavior.
export function AlertDialog({ open, title, description, confirmLabel, onCancel, onConfirm }: {
  open: boolean; title: string; description: ReactNode; confirmLabel: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return <Primitive.Root open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
    <Primitive.Portal>
      <Primitive.Backdrop className="fixed inset-0 z-50 bg-overlay" onClick={onCancel} />
      <Primitive.Popup initialFocus={cancel} className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%_-_48px)] max-w-110 -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-surface-raised p-6 shadow-overlay">
        <Primitive.Title className="text-title-md">{title}</Primitive.Title>
        <Primitive.Description className="text-body-md text-ink-2">{description}</Primitive.Description>
        <div className="flex justify-end gap-2">
          <Button ref={cancel} type="button" variant="ghost" onClick={onCancel}>취소</Button>
          <Button type="button" variant="destructive" className="bg-danger text-on-danger hover:bg-danger-hover" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </Primitive.Popup>
    </Primitive.Portal>
  </Primitive.Root>;
}
