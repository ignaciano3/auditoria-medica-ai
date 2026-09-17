"use client";

import type {
  Finding,
  FindingReviewStatus,
  FindingSeverity,
} from "@audit/domain";
import { findings as copy, ui } from "@audit/lib/i18n";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

const SEVERITY_CLASS: Record<FindingSeverity, string> = {
  high: "border-[#d1242f] text-[#d1242f]",
  medium: "border-[#9a6700] text-[#9a6700]",
  low: "border-foreground/40 text-foreground/70",
  info: "border-foreground/30 text-foreground/60",
};

export function FindingCard({
  documentId,
  finding,
  status,
  note,
  onReview,
}: {
  documentId: string;
  finding: Finding;
  status: FindingReviewStatus;
  note: string | null;
  onReview: (
    findingId: string,
    status: FindingReviewStatus,
    note: string | null,
  ) => void;
}) {
  const [draftNote, setDraftNote] = useState(note ?? "");
  const documentHref = `/documents/${documentId}` as Route;
  const statusNote = draftNote.trim() !== "" ? draftNote : note;

  return (
    <li
      id={`finding-${finding.id}`}
      className="flex scroll-mt-4 flex-col gap-3 rounded-lg border border-foreground/20 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md border px-2 py-0.5 text-sm ${SEVERITY_CLASS[finding.severity]}`}
        >
          {copy.severity[finding.severity]}
        </span>
        <span className="text-sm text-foreground/60">
          {copy.category[finding.category]}
        </span>
        <span className="ml-auto text-sm text-foreground/60">
          {copy.status[status]}
        </span>
      </div>

      <h3 className="font-semibold">{finding.title}</h3>
      <p className="text-sm leading-relaxed">{finding.explanation}</p>
      {finding.recommendation !== undefined ? (
        <p className="text-sm text-foreground/70">{finding.recommendation}</p>
      ) : null}

      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold text-foreground/70">
          {copy.evidence}
        </h4>
        <ul className="flex list-none flex-col gap-1">
          {finding.evidence.map((item, index) => {
            const evidenceKey = `${item.source.pageNumber}-${index}-${item.source.text}`;
            return (
              <li key={evidenceKey}>
                <Link
                  className="text-sm underline"
                  href={{
                    pathname: documentHref,
                    query: { page: item.source.pageNumber },
                    hash: `finding-${finding.id}`,
                  }}
                >
                  {copy.viewPage(item.source.pageNumber)}
                </Link>
                <span className="ml-2 text-sm text-foreground/60">
                  {item.relevance}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="cursor-pointer rounded-md border border-foreground/20 px-3 py-1.5 text-sm"
          onClick={() => onReview(finding.id, "reviewed", statusNote)}
        >
          {ui.reviewed}
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-md border border-foreground/20 px-3 py-1.5 text-sm"
          onClick={() => onReview(finding.id, "dismissed", statusNote)}
        >
          {ui.dismissFinding}
        </button>
        {status !== "pending" ? (
          <button
            type="button"
            className="cursor-pointer rounded-md border border-foreground/20 px-3 py-1.5 text-sm"
            onClick={() => onReview(finding.id, "pending", statusNote)}
          >
            {copy.markPending}
          </button>
        ) : null}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onReview(finding.id, status, draftNote);
        }}
      >
        <label
          className="text-sm font-semibold text-foreground/70"
          htmlFor={`note-${finding.id}`}
        >
          {copy.note}
        </label>
        <textarea
          id={`note-${finding.id}`}
          className="rounded-md border border-foreground/20 bg-background p-2 text-sm"
          maxLength={2000}
          placeholder={copy.notePlaceholder}
          value={draftNote}
          onChange={(event) => setDraftNote(event.target.value)}
        />
        <button
          type="submit"
          className="cursor-pointer self-start rounded-md border border-foreground/20 px-3 py-1.5 text-sm"
        >
          {copy.saveNote}
        </button>
      </form>
    </li>
  );
}
