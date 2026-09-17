"use client";

import type { Document } from "@audit/domain";
import { ui } from "@audit/lib/i18n";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pollIntervalMs } from "./document-status.ts";
import { DocumentStatusBadge } from "./document-status-badge.tsx";

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
      <p className="error" role="alert">
        {ui.loadError}
      </p>
    );
  }
  if (documents.length === 0) {
    return <p className="muted">{ui.noDocuments}</p>;
  }
  return (
    <ul className="document-list">
      {documents.map((doc) => (
        <li key={doc.id} className="document-item">
          <Link className="document-name" href={`/documents/${doc.id}`}>
            {doc.originalFilename}
          </Link>
          <DocumentStatusBadge status={doc.status} />
          {doc.status === "ready" && doc.pageCount !== null ? (
            <span className="muted">
              {doc.pageCount} {ui.pages}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
