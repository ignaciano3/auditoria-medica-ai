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
  const removed = await deleteDocumentById(getContainer(), id);
  if (removed) {
    revalidateTag(DOCUMENTS_TAG, "max");
    revalidateTag(documentTag(id), "max");
    revalidatePath("/");
  }
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
