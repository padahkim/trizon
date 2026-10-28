"use client";

import { useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export default function ClearDataDialog({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  function confirm() {
    try {
      onConfirm();
      setOpen(false);
    } catch {
      setError("데이터를 지우지 못했습니다. 브라우저의 저장 설정을 확인하고 다시 시도해 주세요.");
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => { setOpen(next); setError(null); }}>
      <AlertDialogTrigger render={<Button type="button" variant="outline" disabled={disabled} />}>
        데이터 지우기
      </AlertDialogTrigger>
      <AlertDialogContent initialFocus={cancel} onOverlayClick={() => setOpen(false)}>
        <AlertDialogHeader>
          <AlertDialogTitle>데이터를 지울까요?</AlertDialogTitle>
          <AlertDialogDescription>저장된 보유 내역과 거래를 모두 지웁니다.</AlertDialogDescription>
        </AlertDialogHeader>
        <Alert variant="warning" role="note">
          <TriangleAlert strokeWidth={1.75} aria-hidden="true" />
          <AlertDescription>2년보다 오래된 거래는 SBI에서 다시 받을 수 없습니다.</AlertDescription>
        </Alert>
        {error && (
          <Alert variant="destructive">
            <TriangleAlert strokeWidth={1.75} aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel} variant="ghost">취소</AlertDialogCancel>
          <AlertDialogAction type="button" variant="destructive" onClick={confirm}>데이터 지우기</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
