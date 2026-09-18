import type { DocumentStatus } from "@audit/domain";
import { isTerminalStatus } from "@audit/domain";
import { documentStatusLabels } from "@audit/lib/i18n";

export type StatusTone = "neutral" | "brand" | "success" | "danger";

export function statusLabel(status: DocumentStatus): string {
  return documentStatusLabels[status];
}

export function statusTone(status: DocumentStatus): StatusTone {
  if (status === "ready") return "success";
  if (status === "error") return "danger";
  if (status === "uploaded") return "neutral";
  return "brand";
}

export function isInProgress(status: DocumentStatus): boolean {
  return !isTerminalStatus(status) && status !== "uploaded";
}

export function pollIntervalMs(status: DocumentStatus): number | null {
  return isTerminalStatus(status) ? null : 2000;
}
