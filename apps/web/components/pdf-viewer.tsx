"use client";

import { pageImageAlt, pageIndicator, ui } from "@audit/lib/i18n";
import { useState } from "react";
import { clampPage } from "./pdf-viewer-utils.ts";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export function PdfViewer({
  documentId,
  pageCount,
  initialPage,
}: {
  documentId: string;
  pageCount: number;
  initialPage: number;
}) {
  const [page, setPage] = useState(() => clampPage(initialPage, pageCount));
  const [zoom, setZoom] = useState(1);

  const currentPage = clampPage(page, pageCount);
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < pageCount;
  const canZoomOut = zoom > MIN_ZOOM;
  const canZoomIn = zoom < MAX_ZOOM;

  function goToPage(next: number) {
    setPage(clampPage(next, pageCount));
  }

  return (
    <section className="pdf-viewer" data-page={currentPage}>
      <div className="pdf-toolbar">
        <button
          type="button"
          onClick={() => goToPage(currentPage - 1)}
          disabled={!canGoPrevious}
        >
          {ui.previousPage}
        </button>
        <span className="pdf-page-indicator" aria-live="polite">
          {pageIndicator(currentPage, pageCount)}
        </span>
        <button
          type="button"
          onClick={() => goToPage(currentPage + 1)}
          disabled={!canGoNext}
        >
          {ui.nextPage}
        </button>
        <button
          type="button"
          aria-label={ui.zoomOut}
          disabled={!canZoomOut}
          onClick={() =>
            setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))
          }
        >
          -
        </button>
        <button
          type="button"
          aria-label={ui.zoomIn}
          disabled={!canZoomIn}
          onClick={() =>
            setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))
          }
        >
          +
        </button>
      </div>
      <div className="pdf-page">
        <img
          src={`/api/documents/${documentId}/pages/${currentPage}`}
          alt={pageImageAlt(currentPage)}
          style={{ width: `${zoom * 100}%` }}
        />
      </div>
    </section>
  );
}
