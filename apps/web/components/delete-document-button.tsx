"use client";

import { deleteConfirm, errors, ui } from "@audit/lib/i18n";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteDocument } from "../lib/actions.ts";

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
    <>
      <button
        type="button"
        className="cursor-pointer rounded-md border border-foreground/20 bg-background px-3 py-1.5 text-[#d1242f] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={pending}
        onClick={handleClick}
      >
        {pending ? ui.deleting : ui.deleteDocument}
      </button>
      {failed ? (
        <span className="text-[#d1242f]" role="alert">
          {errors.deleteFailed}
        </span>
      ) : null}
    </>
  );
}
