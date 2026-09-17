import { ui } from "@audit/lib/i18n";
import { io } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClinicalRecordView } from "../../../components/clinical-record-view.tsx";
import { DeleteDocumentButton } from "../../../components/delete-document-button.tsx";
import { DocumentStatusBadge } from "../../../components/document-status-badge.tsx";
import { FindingsSection } from "../../../components/findings-section.tsx";
import { PdfViewer } from "../../../components/pdf-viewer.tsx";
import { getContainer } from "../../../lib/container.ts";
import { serializeDocument } from "../../../lib/serialize-document.ts";

export default function DocumentDetailPage({
  params,
  searchParams,
}: PageProps<"/documents/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-6 sm:px-4">
      <Suspense
        fallback={<output className="text-foreground/60">{ui.loading}</output>}
      >
        <DocumentContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function DocumentContent({
  params,
  searchParams,
}: Pick<PageProps<"/documents/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  await io();
  const container = getContainer();
  const row = await container.documents.getById(id);
  if (!row) notFound();

  const [clinical, pages, reviews] = await Promise.all([
    container.clinicalRecords.getByDocument(id),
    container.pages.listForDocument(id),
    container.findingReviews.listForDocument(id),
  ]);
  const doc = serializeDocument(row);
  const failedPages = pages
    .filter((page) => page.status === "failed")
    .map((page) => page.pageNumber);
  const pageCount = doc.pageCount;

  const pageParam = Array.isArray(query.page) ? query.page[0] : query.page;
  const parsedPage = Number.parseInt(pageParam ?? "1", 10);
  const initialPage = Number.isFinite(parsedPage) ? parsedPage : 1;

  return (
    <>
      <Link
        className="text-sm text-foreground/60 hover:text-foreground"
        href="/"
      >
        {ui.backToHome}
      </Link>
      <header className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold [overflow-wrap:anywhere]">
          {doc.originalFilename}
        </h1>
        <DocumentStatusBadge status={doc.status} />
        <DeleteDocumentButton
          documentId={doc.id}
          fileName={doc.originalFilename}
          redirectTo="/"
        />
      </header>
      {doc.status === "error" && doc.error !== null ? (
        <p className="text-[#d1242f]" role="alert">
          {doc.error}
        </p>
      ) : null}
      {clinical !== null ? (
        <ClinicalRecordView
          documentId={doc.id}
          record={clinical.record}
          incomplete={clinical.extractionIncomplete || failedPages.length > 0}
          failedPages={failedPages}
          failedChunks={clinical.failedChunkCount}
        />
      ) : null}
      {clinical !== null ? (
        <FindingsSection
          documentId={doc.id}
          findings={clinical.findings}
          reviews={reviews}
        />
      ) : null}
      {pageCount !== null && pageCount > 0 ? (
        <PdfViewer
          documentId={doc.id}
          pageCount={pageCount}
          initialPage={initialPage}
          pages={pages}
        />
      ) : (
        <p className="text-foreground/60">
          {pageCount === null ? ui.loading : ui.noPages}
        </p>
      )}
    </>
  );
}
