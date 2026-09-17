import type { DocumentStatus } from "@audit/domain";
import { statusBadgeClass, statusLabel } from "./document-status.ts";

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full bg-foreground/12 px-2 py-0.5 text-[13px] ${statusBadgeClass(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}
