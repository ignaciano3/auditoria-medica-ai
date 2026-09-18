"use server";

import { errors } from "@audit/lib";
import { revalidatePath, revalidateTag } from "next/cache";
import { DOCUMENTS_TAG, documentTag } from "./cache-tags.ts";
import { getContainer } from "./container.ts";
import {
  createUploadedDocument,
  deleteDocumentById,
} from "./documents-service.ts";
import { saveFindingReview } from "./findings-service.ts";
import type { ReviewInput } from "./findings-view.ts";

export type UploadActionResult = { ok: true } | { ok: false; error: string };

export async function uploadDocument(
  formData: FormData,
): Promise<UploadActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: errors.noFile };
  }
  const result = await createUploadedDocument(getContainer(), file);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  revalidateTag(DOCUMENTS_TAG, "max");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteDocument(id: string): Promise<void> {
  const result = await deleteDocumentById(getContainer(), id);
  if (!result.ok) {
    if (result.reason === "storage") throw new Error(errors.deleteFailed);
    return;
  }
  revalidateTag(DOCUMENTS_TAG, "max");
  revalidateTag(documentTag(id), "max");
  revalidatePath("/");
}

export type FindingReviewActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setFindingReview(
  input: ReviewInput,
): Promise<FindingReviewActionResult> {
  const result = await saveFindingReview(getContainer(), input);
  if (result.ok) {
    revalidateTag(documentTag(input.documentId), "max");
    revalidatePath("/documents/[id]", "page");
  }
  return result;
}

export type JobActionResult = { ok: true } | { ok: false; error: string };

export async function redoPageTranscription(
  documentId: string,
  pageNumber: number,
): Promise<JobActionResult> {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return { ok: false, error: errors.redoTranscriptionFailed };
  }
  try {
    const container = getContainer();
    await container.queue.start();
    await container.queue.publish({
      kind: "transcribe-page",
      documentId,
      pageNumber,
    });
  } catch {
    return { ok: false, error: errors.redoTranscriptionFailed };
  }
  revalidateTag(documentTag(documentId), "max");
  revalidatePath("/documents/[id]", "page");
  return { ok: true };
}

export async function reExtractDocument(
  documentId: string,
): Promise<JobActionResult> {
  try {
    const container = getContainer();
    await container.queue.start();
    await container.queue.publish({ kind: "extract-document", documentId });
  } catch {
    return { ok: false, error: errors.reExtractFailed };
  }
  revalidateTag(documentTag(documentId), "max");
  revalidateTag(DOCUMENTS_TAG, "max");
  revalidatePath("/documents/[id]", "page");
  revalidatePath("/");
  return { ok: true };
}

export async function revalidateDocumentData(
  documentId: string,
): Promise<void> {
  revalidateTag(documentTag(documentId), "max");
  revalidateTag(DOCUMENTS_TAG, "max");
  revalidatePath("/documents/[id]", "page");
  revalidatePath("/");
}
