import type { ReactNode } from "react";

export function EmptyState({
  icon,
  children,
  className = "",
}: {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground ${className}`}
    >
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      <p>{children}</p>
    </div>
  );
}
