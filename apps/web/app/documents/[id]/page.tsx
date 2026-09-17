import { ui } from "@audit/lib/i18n";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClinicalRecordView } from "../../../components/clinical-record-view.tsx";
import { DocumentStatusBadge } from "../../../components/document-status-badge.tsx";
import { PdfViewer } from "../../../components/pdf-viewer.tsx";
import { getContainer } from "../../../lib/container.ts";
import { serializeDocument } from "../../../lib/serialize-document.ts";

export default function DocumentDetailPage({
  params,
}: PageProps<"/documents/[id]">) {
  return (
    <main className="page">
      <Suspense fallback={<output className="muted">{ui.loading}</output>}>
        <DocumentContent params={params} />
      </Suspense>
    </main>
  );
}

async function DocumentContent({
  params,
}: Pick<PageProps<"/documents/[id]">, "params">) {
  const { id } = await params;
  await io();
  const container = getContainer();
  const row = await container.documents.getById(id);
  if (!row) notFound();

  const [clinical, pages] = await Promise.all([
    container.clinicalRecords.getByDocument(id),
    container.pages.listForDocument(id),
  ]);
  const doc = serializeDocument(row);
  const failedPages = pages
    .filter((page) => page.status === "failed")
    .map((page) => page.pageNumber);
  const pageCount = doc.pageCount;

  return (
    <>
      <header className="document-header">
        <h1>{doc.originalFilename}</h1>
        <DocumentStatusBadge status={doc.status} />
      </header>
      {doc.status === "error" && doc.error !== null ? (
        <p className="error" role="alert">
          {doc.error}
        </p>
      ) : null}
      {clinical !== null ? (
        <ClinicalRecordView
          record={clinical.record}
          incomplete={clinical.extractionIncomplete || failedPages.length > 0}
          failedPages={failedPages}
          failedChunks={clinical.failedChunkCount}
        />
      ) : null}
      {pageCount !== null && pageCount > 0 ? (
        <PdfViewer documentId={doc.id} pageCount={pageCount} initialPage={1} />
      ) : (
        <p className="muted">{pageCount === null ? ui.loading : ui.noPages}</p>
      )}
    </>
  );
}
