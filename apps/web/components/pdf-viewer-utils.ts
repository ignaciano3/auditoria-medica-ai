import type { PageStatus } from "@audit/domain";
import { processing, ui } from "@audit/lib/i18n";

export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(pageCount) || pageCount < 1) return 1;
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(Math.trunc(page), 1), Math.trunc(pageCount));
}

export type PageTranscriptInput = {
  pageNumber: number;
  text: string;
  status: PageStatus;
  skipReason?: string;
};

export type PageTranscript =
  | { kind: "text"; text: string }
  | { kind: "status"; message: string };

export function pageTranscript(
  page: PageTranscriptInput | undefined,
): PageTranscript {
  if (page === undefined)
    return { kind: "status", message: processing.pending };
  if (page.status === "text" || page.status === "vision") {
    const text = page.text.trim();
    if (text.length > 0) return { kind: "text", text };
    return { kind: "status", message: ui.noTranscription };
  }
  if (page.status === "skipped") {
    return {
      kind: "status",
      message: page.skipReason ?? processing.notDataBearing,
    };
  }
  if (page.status === "failed") {
    return { kind: "status", message: processing.failed };
  }
  return { kind: "status", message: processing.pending };
}
