"use client";

import { useState } from "react";
import { DocumentList } from "../components/document-list.tsx";
import { DocumentUploader } from "../components/document-uploader.tsx";
import { ui } from "../lib/i18n.ts";

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <main className="page">
      <h1>{ui.appTitle}</h1>
      <DocumentUploader onUploaded={() => setRefreshKey((key) => key + 1)} />
      <DocumentList refreshKey={refreshKey} />
    </main>
  );
}
