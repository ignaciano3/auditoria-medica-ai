import type { ReactNode } from "react";
import { ChevronDownIcon } from "../icons.tsx";
import { Badge } from "./badge.tsx";

export function Section({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number | undefined;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="group rounded-xl border border-border bg-surface open:shadow-xs"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-xl px-4 py-3 font-semibold transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        <span className="flex-1">{title}</span>
        {count !== undefined ? <Badge tone="neutral">{count}</Badge> : null}
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}
