import type { DocumentStatus } from "@audit/domain";
import { isTerminalStatus } from "@audit/domain";
import { documentStatusLabels } from "../lib/i18n.ts";

export function statusLabel(status: DocumentStatus): string {
  return documentStatusLabels[status];
}

export function pollIntervalMs(status: DocumentStatus): number | null {
  return isTerminalStatus(status) ? null : 2000;
}
