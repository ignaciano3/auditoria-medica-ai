"use client";

import type { DocumentStatus, PageStatus } from "@audit/domain";
import {
  pageImageAlt,
  pageIndicator,
  pageProgress,
  processing,
  ui,
} from "@audit/lib/i18n";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { redoPageTranscription } from "../lib/actions.ts";
import { renderBlockMarkdown } from "../lib/block-markdown.tsx";
import { pollIntervalMs } from "./document-status.ts";
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
  processedPageCount,
  viewerAnchorId,
} from "./pdf-viewer-utils.ts";
import { Button } from "./ui/button.tsx";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90_000;

type ViewerTab = "transcription" | "image";

type RedoState = {
  pageNumber: number;
  status: PageStatus;
  text: string;
  sawPending: boolean;
};

export function PdfViewer({
  documentId,
  status,
  pageCount,
  initialPage,
  pages,
}: {
  documentId: string;
  status: DocumentStatus;
  pageCount: number;
  initialPage: number;
  pages: PageTranscriptInput[];
}) {
  const router = useRouter();
  const [page, setPage] = useState(() => clampPage(initialPage, pageCount));
  const [tab, setTab] = useState<ViewerTab>("image");
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
  const pollMs = pollIntervalMs(status);
  const processedPages = processedPageCount(pages);

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

  useEffect(() => {
    if (pollMs === null) return;
    const timer = setInterval(() => router.refresh(), pollMs);
    return () => clearInterval(timer);
  }, [pollMs, router]);

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
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
      data-page={currentPage}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
        <div
          className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5"
          role="tablist"
        >
          <TabButton active={tab === "image"} onClick={() => setTab("image")}>
            {ui.image}
          </TabButton>
          <TabButton
            active={tab === "transcription"}
            onClick={() => setTab("transcription")}
          >
            {ui.transcription}
          </TabButton>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {pollMs !== null ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {pageProgress(processedPages, pageCount)}
            </span>
          ) : null}
          {tab === "transcription" ? (
            canRedo ? (
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
            ) : null
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {tab === "image" ? (
        <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-3">
          {pageInput?.imageKey !== undefined ? (
            // biome-ignore lint/performance/noImgElement: PDF page render with dynamic zoom/scroll
            <img
              className="mx-auto block h-auto max-w-none rounded-md shadow-sm"
              src={`/api/documents/${documentId}/pages/${currentPage}`}
              alt={pageImageAlt(currentPage)}
              style={{ width: `${zoom * 100}%` }}
            />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              {processing.pending}
            </p>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {transcript.kind === "text" ? (
            <div className="space-y-2 text-sm leading-relaxed">
              {renderBlockMarkdown(transcript.text)}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {transcript.message}
            </p>
          )}
          {redoError !== null ? (
            <p className="mt-2 text-sm text-danger" role="alert">
              {redoError}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex items-center justify-center gap-1 border-t border-border p-2">
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
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`cursor-pointer rounded-md px-2.5 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        active
          ? "bg-surface text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
