"use client";

import type { Document } from "@audit/domain";
import { ui } from "@audit/lib/i18n";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DeleteDocumentButton } from "./delete-document-button.tsx";
import { pollIntervalMs } from "./document-status.ts";
import { DocumentStatusBadge } from "./document-status-badge.tsx";
import { FileTextIcon } from "./icons.tsx";
import { Callout } from "./ui/callout.tsx";
import { EmptyState } from "./ui/empty-state.tsx";

type DocumentsState =
  | { kind: "loaded"; documents: Document[] }
  | { kind: "error" };

export function DocumentList({
  initialDocuments,
}: {
  initialDocuments: Document[];
}) {
  const [state, setState] = useState<DocumentsState>({
    kind: "loaded",
    documents: initialDocuments,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setState({ kind: "loaded", documents: initialDocuments });
  }, [initialDocuments]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      if (!response.ok) throw new Error("documents request failed");
      const payload = (await response.json()) as { documents: Document[] };
      if (!mountedRef.current) return;
      setState({ kind: "loaded", documents: payload.documents });
    } catch {
      if (!mountedRef.current) return;
      setState((current) =>
        current.kind === "loaded" && current.documents.length > 0
          ? current
          : { kind: "error" },
      );
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const documents = state.kind === "loaded" ? state.documents : [];

  useEffect(() => {
    const intervals = documents
      .map((doc) => pollIntervalMs(doc.status))
      .filter((ms): ms is number => ms !== null);
    if (intervals.length === 0) return;
    const timer = setInterval(
      () => {
        load().catch(() => undefined);
      },
      Math.min(...intervals),
    );
    return () => clearInterval(timer);
  }, [documents, load]);

  if (state.kind === "error") {
    return (
      <Callout tone="danger" role="alert">
        <p>{ui.loadError}</p>
      </Callout>
    );
  }
  if (documents.length === 0) {
    return (
      <EmptyState icon={<FileTextIcon className="size-6" />}>
        {ui.noDocuments}
      </EmptyState>
    );
  }
  return (
    <ul className="flex list-none flex-col gap-2">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-xs transition-colors hover:border-brand/40"
        >
          <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
          <Link
            className="flex-1 font-medium [overflow-wrap:anywhere] transition-colors group-hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            href={`/documents/${doc.id}`}
          >
            {doc.originalFilename}
          </Link>
          <DocumentStatusBadge status={doc.status} />
          {doc.status === "ready" && doc.pageCount !== null ? (
            <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">
              {doc.pageCount} {ui.pages}
            </span>
          ) : null}
          <DeleteDocumentButton
            documentId={doc.id}
            fileName={doc.originalFilename}
            onDeleted={() =>
              setState((current) =>
                current.kind === "loaded"
                  ? {
                      kind: "loaded",
                      documents: current.documents.filter(
                        (entry) => entry.id !== doc.id,
                      ),
                    }
                  : current,
              )
            }
          />
        </li>
      ))}
    </ul>
  );
}
