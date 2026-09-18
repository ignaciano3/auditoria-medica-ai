import type { DocumentStatus } from "@audit/domain";
import { isInProgress, statusLabel, statusTone } from "./document-status.ts";
import { SpinnerIcon } from "./icons.tsx";
import { Badge } from "./ui/badge.tsx";

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <Badge tone={statusTone(status)}>
      {isInProgress(status) ? <SpinnerIcon className="size-3" /> : null}
      {statusLabel(status)}
    </Badge>
  );
}
