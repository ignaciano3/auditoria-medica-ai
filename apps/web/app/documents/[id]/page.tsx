"use client";

import type {
  ClinicalRecord,
  Document,
  PageDocType,
  PageStatus,
} from "@audit/domain";
import { ui } from "@audit/lib/i18n";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ClinicalRecordView } from "../../../components/clinical-record-view.tsx";
import { DocumentStatusBadge } from "../../../components/document-status-badge.tsx";
import { PdfViewer } from "../../../components/pdf-viewer.tsx";

type PageSummary = {
  pageNumber: number;
  status: PageStatus;
  docType: PageDocType;
};

type DocumentState =
  | { kind: "loading" }
  | {
      kind: "loaded";
      document: Document;
      record: ClinicalRecord | null;
      extractionIncomplete: boolean;
      failedChunkCount: number;
      pages: PageSummary[];
    }
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
        const payload = (await response.json()) as {
          document: Document;
          record: ClinicalRecord | null;
          extractionIncomplete: boolean;
          failedChunkCount: number;
          pages: PageSummary[];
        };
        if (!mountedRef.current) return;
        setState({
          kind: "loaded",
          document: payload.document,
          record: payload.record,
          extractionIncomplete: payload.extractionIncomplete,
          failedChunkCount: payload.failedChunkCount,
          pages: payload.pages,
        });
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
  const failedPages = state.pages
    .filter((page) => page.status === "failed")
    .map((page) => page.pageNumber);

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
      {state.record !== null ? (
        <ClinicalRecordView
          record={state.record}
          incomplete={state.extractionIncomplete || failedPages.length > 0}
          failedPages={failedPages}
          failedChunks={state.failedChunkCount}
        />
      ) : null}
      {pageCount !== null && pageCount > 0 ? (
        <PdfViewer documentId={doc.id} pageCount={pageCount} initialPage={1} />
      ) : (
        <p className="muted">{pageCount === null ? ui.loading : ui.noPages}</p>
      )}
    </main>
  );
}
