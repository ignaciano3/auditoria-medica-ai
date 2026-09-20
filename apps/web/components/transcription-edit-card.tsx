"use client";

import { editProposalOccurrences, editProposalPage, ui } from "@audit/lib/i18n";
import { Button } from "./ui/button.tsx";

export type TranscriptionEditView = {
  pageNumber: number;
  incorrect: string;
  correct: string;
  occurrences: number;
  resultingText: string;
};

export function TranscriptionEditCard({
  proposal,
  applying,
  error,
  onConfirm,
  onCancel,
}: {
  proposal: TranscriptionEditView;
  applying: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-xs">
      <p className="text-sm font-semibold text-foreground">
        {ui.editProposalTitle}
      </p>
      <p className="text-xs text-muted-foreground">
        {editProposalPage(proposal.pageNumber)}
      </p>
      <p className="mt-2 text-sm text-foreground">
        <span className="rounded bg-danger/10 px-1 line-through">
          {proposal.incorrect}
        </span>
        {" → "}
        <span className="rounded bg-brand/10 px-1 font-medium">
          {proposal.correct}
        </span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {editProposalOccurrences(proposal.occurrences)}
      </p>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
        {proposal.resultingText}
      </pre>
      {error !== null ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={applying}
          onClick={onConfirm}
        >
          {applying ? ui.editApplying : ui.editConfirm}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={applying}
          onClick={onCancel}
        >
          {ui.editCancel}
        </Button>
      </div>
    </div>
  );
}
