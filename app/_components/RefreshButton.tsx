"use client";

import { useFormStatus } from "react-dom";
import { refreshQuotes } from "../actions.ts";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn" disabled={pending}>
      {pending ? "갱신 중…" : "시세 새로고침"}
    </button>
  );
}

export function RefreshButton() {
  return (
    <form action={refreshQuotes}>
      <Submit />
    </form>
  );
}
