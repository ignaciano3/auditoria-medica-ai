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
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-8">
      <Suspense
        fallback={<output className="text-foreground/60">{ui.loading}</output>}
      >
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
      <header className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold [overflow-wrap:anywhere]">
          {doc.originalFilename}
        </h1>
        <DocumentStatusBadge status={doc.status} />
      </header>
      {doc.status === "error" && doc.error !== null ? (
        <p className="text-[#d1242f]" role="alert">
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
        <p className="text-foreground/60">
          {pageCount === null ? ui.loading : ui.noPages}
        </p>
      )}
    </>
  );
}
