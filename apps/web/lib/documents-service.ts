import type { DocumentStatus } from "@audit/domain";
import type { JobQueue, StorageProvider } from "@audit/lib";
import { errors } from "@audit/lib";

export const maxUploadBytes = 50 * 1024 * 1024;

export type UploadMeta = { name: string; type: string; size: number };

export type UploadValidation = { ok: true } | { ok: false; error: string };

export function validateUpload(meta: UploadMeta): UploadValidation {
  if (
    meta.type !== "application/pdf" ||
    !meta.name.toLowerCase().endsWith(".pdf")
  ) {
    return { ok: false, error: errors.notPdf };
  }
  if (meta.size > maxUploadBytes) {
    return { ok: false, error: errors.tooLarge };
  }
  if (meta.size <= 0) {
    return { ok: false, error: errors.invalidFile };
  }
  return { ok: true };
}

export type DocumentServiceDeps = {
  storage: StorageProvider;
  queue: JobQueue;
  documents: {
    create(input: {
      id: string;
      originalFilename: string;
      originalKey: string;
    }): Promise<{ id: string; status: DocumentStatus }>;
    getById(id: string): Promise<{ originalKey: string } | null>;
    remove(id: string): Promise<void>;
  };
};

export type CreateUploadedDocumentResult =
  | { ok: true; id: string; status: DocumentStatus }
  | { ok: false; error: string; reason: "invalid" | "storage" };

export async function createUploadedDocument(
  deps: DocumentServiceDeps,
  file: File,
): Promise<CreateUploadedDocumentResult> {
  const validation = validateUpload({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (!validation.ok) {
    return { ok: false, error: validation.error, reason: "invalid" };
  }

  const id = crypto.randomUUID();
  const key = `documents/${id}/original.pdf`;
  try {
    await deps.storage.put(
      key,
      new Uint8Array(await file.arrayBuffer()),
      "application/pdf",
    );
    const document = await deps.documents.create({
      id,
      originalFilename: file.name,
      originalKey: key,
    });
    await deps.queue.start();
    await deps.queue.publish({
      kind: "process-document",
      documentId: document.id,
    });
    return { ok: true, id: document.id, status: document.status };
  } catch {
    await deps.storage.delete(key).catch(() => undefined);
    await deps.documents.remove(id).catch(() => undefined);
    return { ok: false, error: errors.uploadFailed, reason: "storage" };
  }
}

export async function deleteDocumentById(
  deps: DocumentServiceDeps,
  id: string,
): Promise<boolean> {
  const row = await deps.documents.getById(id);
  if (!row) return false;
  await deps.documents.remove(id);
  await deps.storage.delete(row.originalKey).catch(() => undefined);
  return true;
}
