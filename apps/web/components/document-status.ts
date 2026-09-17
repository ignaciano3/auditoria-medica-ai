import type { DocumentStatus } from "@audit/domain";
import { isTerminalStatus } from "@audit/domain";
import { documentStatusLabels } from "@audit/lib/i18n";

const badgeOverrides: Record<DocumentStatus, string> = {
  uploaded: "",
  processing: "",
  extracting: "",
  analyzing: "",
  ready: "bg-[#1a7f37] text-white",
  error: "bg-[#d1242f] text-white",
};

export function statusLabel(status: DocumentStatus): string {
  return documentStatusLabels[status];
}

export function statusBadgeClass(status: DocumentStatus): string {
  return badgeOverrides[status];
}

export function pollIntervalMs(status: DocumentStatus): number | null {
  return isTerminalStatus(status) ? null : 2000;
}
