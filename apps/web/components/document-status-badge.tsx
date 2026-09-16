import type { DocumentStatus } from "@audit/domain";
import { statusLabel } from "./document-status.ts";

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      {statusLabel(status)}
    </span>
  );
}
