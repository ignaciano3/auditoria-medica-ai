import type { ClinicalRecordWithFindings, FindingReview } from "@audit/db";
import { ui } from "@audit/lib/i18n";
import { io } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChatPanel } from "../../../components/chat-panel.tsx";
import { ClinicalRecordView } from "../../../components/clinical-record-view.tsx";
import { DeleteDocumentButton } from "../../../components/delete-document-button.tsx";
import { DocumentStatusBadge } from "../../../components/document-status-badge.tsx";
import { FindingsSection } from "../../../components/findings-section.tsx";
import { ArrowLeftIcon } from "../../../components/icons.tsx";
import { PdfViewer } from "../../../components/pdf-viewer.tsx";
import { ReExtractButton } from "../../../components/re-extract-button.tsx";
import { DetailSkeleton } from "../../../components/skeletons.tsx";
import { buttonVariants } from "../../../components/ui/button.tsx";
import { Callout } from "../../../components/ui/callout.tsx";
import { getClinicalData } from "../../../lib/cached-data.ts";
import { getContainer } from "../../../lib/container.ts";
import { serializeChatMessage } from "../../../lib/serialize-chat-message.ts";
import { serializeDocument } from "../../../lib/serialize-document.ts";

export default function DocumentDetailPage({
  params,
  searchParams,
}: PageProps<"/documents/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-6 sm:px-4">
      <Link
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "-ml-2 w-fit text-muted-foreground",
        })}
        href="/"
      >
        <ArrowLeftIcon className="size-4" />
        {ui.appTitle}
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
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

  const pages = await container.pages.listForDocument(id);
  const chatMessages = await container.chatMessages.listForDocument(id);

  // Clinical data and reviews are immutable once the document is ready, so we
  // read them through the cache (tagged per document, invalidated on review).
  // While the worker is still writing, read straight from the database.
  let clinical: ClinicalRecordWithFindings | null;
  let reviews: FindingReview[];
  if (row.status === "ready") {
    const cached = await getClinicalData(id);
    clinical = cached?.clinical ?? null;
    reviews = cached?.reviews ?? [];
  } else {
    [clinical, reviews] = await Promise.all([
      container.clinicalRecords.getByDocument(id),
      container.findingReviews.listForDocument(id),
    ]);
  }

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
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-2xl">
          {doc.originalFilename}
        </h1>
        <DocumentStatusBadge status={doc.status} />
        <ReExtractButton
          documentId={doc.id}
          status={doc.status}
          updatedAt={doc.updatedAt}
        />
        <DeleteDocumentButton
          documentId={doc.id}
          fileName={doc.originalFilename}
          redirectTo="/"
        />
      </header>
      {doc.status === "error" && doc.error !== null ? (
        <Callout tone="danger" role="alert">
          <p>{doc.error}</p>
        </Callout>
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
      <div className="grid gap-4 lg:-mb-6 lg:h-dvh lg:grid-cols-[1.7fr_1fr] lg:pb-8">
        <div className="min-h-0">
          {pageCount !== null && pageCount > 0 ? (
            <PdfViewer
              documentId={doc.id}
              pageCount={pageCount}
              initialPage={initialPage}
              pages={pages}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {pageCount === null ? ui.loading : ui.noPages}
            </p>
          )}
        </div>
        <div className="min-h-0">
          <ChatPanel
            documentId={doc.id}
            initialMessages={chatMessages.map(serializeChatMessage)}
            ready={doc.status === "ready"}
          />
        </div>
      </div>
    </>
  );
}
