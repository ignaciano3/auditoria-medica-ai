"use client";

import { pageImageAlt, pageIndicator, ui } from "@audit/lib/i18n";
import { useEffect, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MinusIcon,
  PlusIcon,
} from "./icons.tsx";
import {
  clampPage,
  type PageTranscriptInput,
  pageTranscript,
  viewerAnchorId,
} from "./pdf-viewer-utils.ts";
import { Button } from "./ui/button.tsx";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export function PdfViewer({
  documentId,
  pageCount,
  initialPage,
  pages,
}: {
  documentId: string;
  pageCount: number;
  initialPage: number;
  pages: PageTranscriptInput[];
}) {
  const [page, setPage] = useState(() => clampPage(initialPage, pageCount));
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setPage(clampPage(initialPage, pageCount));
  }, [initialPage, pageCount]);

  const currentPage = clampPage(page, pageCount);
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < pageCount;
  const canZoomOut = zoom > MIN_ZOOM;
  const canZoomIn = zoom < MAX_ZOOM;

  const transcript = pageTranscript(
    pages.find((entry) => entry.pageNumber === currentPage),
  );

  function goToPage(next: number) {
    setPage(clampPage(next, pageCount));
  }

  return (
    <section
      id={viewerAnchorId}
      className="flex scroll-mt-4 flex-col gap-3"
      data-page={currentPage}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-xs">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            aria-label={ui.previousPage}
            onClick={() => goToPage(currentPage - 1)}
            disabled={!canGoPrevious}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span
            className="min-w-32 px-2 text-center text-sm font-medium"
            aria-live="polite"
          >
            {pageIndicator(currentPage, pageCount)}
          </span>
          <Button
            variant="secondary"
            size="icon"
            aria-label={ui.nextPage}
            onClick={() => goToPage(currentPage + 1)}
            disabled={!canGoNext}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            aria-label={ui.zoomOut}
            disabled={!canZoomOut}
            onClick={() =>
              setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))
            }
          >
            <MinusIcon className="size-4" />
          </Button>
          <span className="w-12 text-center text-sm text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="secondary"
            size="icon"
            aria-label={ui.zoomIn}
            disabled={!canZoomIn}
            onClick={() =>
              setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))
            }
          >
            <PlusIcon className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-auto rounded-xl border border-border bg-muted/40 p-3">
          {/* biome-ignore lint/performance/noImgElement: PDF page render with dynamic zoom/scroll */}
          <img
            className="mx-auto block h-auto max-w-none rounded-md shadow-sm"
            src={`/api/documents/${documentId}/pages/${currentPage}`}
            alt={pageImageAlt(currentPage)}
            style={{ width: `${zoom * 100}%` }}
          />
        </div>
        <div className="relative">
          <aside className="flex flex-col gap-2 overflow-auto rounded-xl border border-border bg-surface p-4 lg:absolute lg:inset-0">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {ui.transcription}
            </h2>
            {transcript.kind === "text" ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                {transcript.text}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {transcript.message}
              </p>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
