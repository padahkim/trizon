import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// shadcn Table primitives, adapted to the repository's surface and typography tokens.
export function Table({ className, ...props }: ComponentProps<"table">) {
  return <div data-slot="table-container" className="relative w-full overflow-x-auto"><table data-slot="table" className={cn("w-full min-w-190 text-body-sm tabular-nums", className)} {...props} /></div>;
}
export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("border-b border-line text-label text-ink-2", className)} {...props} />;
}
export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return <tfoot data-slot="table-footer" className={cn("border-t border-line bg-surface font-semibold", className)} {...props} />;
}
export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("border-b border-line", className)} {...props} />;
}
export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return <th data-slot="table-head" className={cn("px-3 py-3 text-right align-middle whitespace-nowrap first:text-left", className)} {...props} />;
}
export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("px-3 py-3 text-right align-middle first:text-left", className)} {...props} />;
}
export function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("text-caption text-ink-2", className)} {...props} />;
}
