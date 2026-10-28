import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2 py-0.5 text-badge whitespace-nowrap", {
  variants: {
    variant: {
      secondary: "bg-surface-sunken text-ink-2",
      outline: "border border-line-strong text-ink-2",
      warning: "bg-warning-soft text-warning-text",
      success: "bg-ok-soft text-ok",
      error: "bg-danger-soft text-danger",
    },
  },
  defaultVariants: { variant: "secondary" },
});

export function Badge({ className, variant, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
