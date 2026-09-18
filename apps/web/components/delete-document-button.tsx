"use client";

import { deleteConfirm, errors, ui } from "@audit/lib/i18n";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteDocument } from "../lib/actions.ts";
import { TrashIcon } from "./icons.tsx";
import { Button } from "./ui/button.tsx";

export function DeleteDocumentButton({
  documentId,
  fileName,
  onDeleted,
  redirectTo,
}: {
  documentId: string;
  fileName: string;
  onDeleted?: () => void;
  redirectTo?: Route;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    if (!window.confirm(deleteConfirm(fileName))) return;
    setPending(true);
    setFailed(false);
    try {
      await deleteDocument(documentId);
      onDeleted?.();
      if (redirectTo !== undefined) router.push(redirectTo);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={handleClick}
        aria-label={ui.deleteDocument}
      >
        <TrashIcon className="size-4" />
        <span className="hidden sm:inline">
          {pending ? ui.deleting : ui.deleteDocument}
        </span>
      </Button>
      {failed ? (
        <span className="text-sm text-danger" role="alert">
          {errors.deleteFailed}
        </span>
      ) : null}
    </span>
  );
}
