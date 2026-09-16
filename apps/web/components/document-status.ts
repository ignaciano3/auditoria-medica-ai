import type { DocumentStatus } from "@audit/domain";
import { isTerminalStatus } from "@audit/domain";
import { documentStatusLabels } from "@audit/lib/i18n";

export function statusLabel(status: DocumentStatus): string {
  return documentStatusLabels[status];
}

export function pollIntervalMs(status: DocumentStatus): number | null {
  return isTerminalStatus(status) ? null : 2000;
}
