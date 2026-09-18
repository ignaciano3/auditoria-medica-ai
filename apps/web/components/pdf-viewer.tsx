"use client";

import type { PageStatus } from "@audit/domain";
import { pageImageAlt, pageIndicator, ui } from "@audit/lib/i18n";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { redoPageTranscription } from "../lib/actions.ts";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MinusIcon,
  PlusIcon,
  RefreshIcon,
} from "./icons.tsx";
import {
  canRedoTranscription,
  clampPage,
  type PageTranscriptInput,
  pageTranscript,
  viewerAnchorId,
} from "./pdf-viewer-utils.ts";
import { Button } from "./ui/button.tsx";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90_000;

type RedoState = {
  pageNumber: number;
  status: PageStatus;
  text: string;
  sawPending: boolean;
};

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
  const router = useRouter();
  const [page, setPage] = useState(() => clampPage(initialPage, pageCount));
  const [zoom, setZoom] = useState(1);
  const [redo, setRedo] = useState<RedoState | null>(null);
  const [redoError, setRedoError] = useState<string | null>(null);

  useEffect(() => {
    setPage(clampPage(initialPage, pageCount));
  }, [initialPage, pageCount]);

  const currentPage = clampPage(page, pageCount);
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < pageCount;
  const canZoomOut = zoom > MIN_ZOOM;
  const canZoomIn = zoom < MAX_ZOOM;

  const pageInput = pages.find((entry) => entry.pageNumber === currentPage);
  const transcript = pageTranscript(pageInput);
  const canRedo = canRedoTranscription(pageInput);
  const redoActive = redo !== null;

  useEffect(() => {
    if (redo === null) return;
    const target = pages.find((entry) => entry.pageNumber === redo.pageNumber);
    if (target === undefined) return;
    if (target.status === "pending") {
      if (!redo.sawPending) setRedo({ ...redo, sawPending: true });
      return;
    }
    const changed = target.status !== redo.status || target.text !== redo.text;
    if (changed || redo.sawPending) setRedo(null);
  }, [pages, redo]);

  useEffect(() => {
    if (!redoActive) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    const timeout = setTimeout(() => setRedo(null), POLL_TIMEOUT_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [redoActive, router]);

  function goToPage(next: number) {
    setPage(clampPage(next, pageCount));
  }

  async function handleRedo() {
    if (pageInput === undefined) return;
    setRedoError(null);
    setRedo({
      pageNumber: currentPage,
      status: pageInput.status,
      text: pageInput.text,
      sawPending: false,
    });
    const result = await redoPageTranscription(documentId, currentPage);
    if (!result.ok) {
      setRedo(null);
      setRedoError(result.error);
    }
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
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {ui.transcription}
              </h2>
              {canRedo ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={redoActive}
                  onClick={handleRedo}
                  aria-label={ui.redoTranscription}
                >
                  <RefreshIcon className="size-4" />
                  <span className="hidden sm:inline">
                    {redoActive
                      ? ui.redoTranscriptionPending
                      : ui.redoTranscription}
                  </span>
                </Button>
              ) : null}
            </div>
            {transcript.kind === "text" ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                {transcript.text}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {transcript.message}
              </p>
            )}
            {redoError !== null ? (
              <p className="text-sm text-danger" role="alert">
                {redoError}
              </p>
            ) : null}
          </aside>
        </div>
      </div>
    </section>
  );
}
