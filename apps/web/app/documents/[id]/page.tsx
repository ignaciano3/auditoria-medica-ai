"use client";

import type { Document } from "@audit/domain";
import { ui } from "@audit/lib/i18n";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DocumentStatusBadge } from "../../../components/document-status-badge.tsx";
import { PdfViewer } from "../../../components/pdf-viewer.tsx";

type DocumentState =
  | { kind: "loading" }
  | { kind: "loaded"; document: Document }
  | { kind: "error" };

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documentId = params.id;
  const [state, setState] = useState<DocumentState>({ kind: "loading" });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/documents/${documentId}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("document request failed");
        const payload = (await response.json()) as { document: Document };
        if (!mountedRef.current) return;
        setState({ kind: "loaded", document: payload.document });
      } catch {
        if (!mountedRef.current) return;
        setState({ kind: "error" });
      }
    }
    load();
  }, [documentId]);

  if (state.kind === "loading") {
    return (
      <main className="page">
        <output className="muted">{ui.loading}</output>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="page">
        <p className="error" role="alert">
          {ui.documentLoadError}
        </p>
      </main>
    );
  }

  const doc = state.document;
  const pageCount = doc.pageCount;

  return (
    <main className="page">
      <header className="document-header">
        <h1>{doc.originalFilename}</h1>
        <DocumentStatusBadge status={doc.status} />
      </header>
      {doc.status === "error" && doc.error !== null ? (
        <p className="error" role="alert">
          {doc.error}
        </p>
      ) : null}
      {pageCount !== null && pageCount > 0 ? (
        <PdfViewer documentId={doc.id} pageCount={pageCount} initialPage={1} />
      ) : (
        <p className="muted">{pageCount === null ? ui.loading : ui.noPages}</p>
      )}
    </main>
  );
}
