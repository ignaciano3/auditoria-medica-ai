import { ui } from "@audit/lib/i18n";
import { Suspense } from "react";
import { DocumentList } from "../components/document-list.tsx";
import { DocumentUploader } from "../components/document-uploader.tsx";
import { getContainer } from "../lib/container.ts";
import { serializeDocument } from "../lib/serialize-document.ts";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="page">
      <h1>{ui.appTitle}</h1>
      <DocumentUploader />
      <Suspense fallback={<p className="muted">{ui.loading}</p>}>
        <DocumentListSection />
      </Suspense>
    </main>
  );
}

async function DocumentListSection() {
  const rows = await getContainer().documents.list();
  const documents = rows.map((row) => serializeDocument(row));
  return <DocumentList initialDocuments={documents} />;
}
