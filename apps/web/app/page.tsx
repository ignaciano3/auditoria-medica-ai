"use client";

import { ui } from "@audit/lib/i18n";
import { DocumentList } from "../components/document-list.tsx";
import { DocumentUploader } from "../components/document-uploader.tsx";

export default function Home() {
  return (
    <main className="page">
      <h1>{ui.appTitle}</h1>
      <DocumentUploader />
      <DocumentList />
    </main>
  );
}
