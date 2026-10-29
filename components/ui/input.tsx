import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// shadcn Input, adapted to DESIGN.md's field tokens.
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn("h-10 w-full min-w-0 rounded-md border border-line-strong bg-surface-raised px-3 text-body-md text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-invalid:border-danger", className)} {...props} />;
}
