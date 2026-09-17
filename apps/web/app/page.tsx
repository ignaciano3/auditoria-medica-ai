import { ui } from "@audit/lib/i18n";
import { io } from "next/cache";
import { Suspense } from "react";
import { DocumentList } from "../components/document-list.tsx";
import { DocumentUploader } from "../components/document-uploader.tsx";
import { getContainer } from "../lib/container.ts";
import { serializeDocument } from "../lib/serialize-document.ts";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-8">
      <h1 className="text-2xl font-semibold">{ui.appTitle}</h1>
      <DocumentUploader />
      <Suspense fallback={<p className="text-foreground/60">{ui.loading}</p>}>
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
