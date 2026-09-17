"use server";

import { errors } from "@audit/lib";
import { revalidatePath } from "next/cache";
import { getContainer } from "./container.ts";
import {
  createUploadedDocument,
  deleteDocumentById,
} from "./documents-service.ts";

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
  revalidatePath("/");
  return { ok: true };
}

export async function deleteDocument(id: string): Promise<void> {
  const removed = await deleteDocumentById(getContainer(), id);
  if (removed) revalidatePath("/");
}
