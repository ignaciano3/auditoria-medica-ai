import { ui } from "@audit/lib/i18n";
import { io } from "next/cache";
import { Suspense } from "react";
import { DocumentList } from "../components/document-list.tsx";
import { DocumentUploader } from "../components/document-uploader.tsx";
import { getContainer } from "../lib/container.ts";
import { serializeDocument } from "../lib/serialize-document.ts";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 py-8 sm:px-4">
      <h1 className="text-2xl font-semibold tracking-tight">{ui.appTitle}</h1>
      <DocumentUploader />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">{ui.loading}</p>}
      >
        <DocumentListSection />
      </Suspense>
    </main>
  );
}

async function DocumentListSection() {
  await io();
  const rows = await getContainer().documents.list();
  const documents = rows.map((row) => serializeDocument(row));
  return <DocumentList initialDocuments={documents} />;
}
