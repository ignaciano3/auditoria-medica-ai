export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className}`}
      aria-hidden="true"
    />
  );
}

const LIST_KEYS = ["a", "b", "c"];

export function ListSkeleton() {
  return (
    <ul className="flex list-none flex-col gap-2">
      {LIST_KEYS.map((key) => (
        <li
          key={key}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-xs"
        >
          <Skeleton className="size-5" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-8 w-20" />
        </li>
      ))}
    </ul>
  );
}

const DETAIL_KEYS = ["a", "b", "c"];

export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-2/3 max-w-md" />
      {DETAIL_KEYS.map((key) => (
        <div
          key={key}
          className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs"
        >
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
