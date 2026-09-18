"use client";

import type { DocumentStatus } from "@audit/domain";
import { errors, ui } from "@audit/lib/i18n";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { reExtractDocument, revalidateDocumentData } from "../lib/actions.ts";
import { SparklesIcon } from "./icons.tsx";
import { Button } from "./ui/button.tsx";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 300_000;

export function ReExtractButton({
  documentId,
  status,
  updatedAt,
}: {
  documentId: string;
  status: DocumentStatus;
  updatedAt: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const disabled = pending || (status !== "ready" && status !== "error");

  useEffect(() => {
    if (!pending || startedAt === null) return;
    const terminal = status === "ready" || status === "error";
    if (!terminal || updatedAt === startedAt) return;
    setPending(false);
    setStartedAt(null);
    revalidateDocumentData(documentId)
      .then(() => router.refresh())
      .catch(() => undefined);
  }, [status, updatedAt, pending, startedAt, documentId, router]);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    const timeout = setTimeout(() => {
      setPending(false);
      setStartedAt(null);
    }, POLL_TIMEOUT_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [pending, router]);

  async function handleClick() {
    setFailed(false);
    setPending(true);
    setStartedAt(updatedAt);
    const result = await reExtractDocument(documentId);
    if (!result.ok) {
      setPending(false);
      setStartedAt(null);
      setFailed(true);
    }
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={handleClick}
        aria-label={ui.reExtract}
      >
        <SparklesIcon className="size-4" />
        <span className="hidden sm:inline">
          {pending ? ui.reExtractPending : ui.reExtract}
        </span>
      </Button>
      {failed ? (
        <span className="text-sm text-danger" role="alert">
          {errors.reExtractFailed}
        </span>
      ) : null}
    </span>
  );
}
