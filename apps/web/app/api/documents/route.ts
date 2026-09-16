import { errors } from "@audit/lib";
import { NextResponse } from "next/server";
import { getContainer } from "../../../lib/container.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const maxUploadBytes = 50 * 1024 * 1024;

export type UploadMeta = { name: string; type: string; size: number };

export function validateUpload(
  meta: UploadMeta,
): { ok: true } | { ok: false; error: string } {
  if (
    meta.type !== "application/pdf" ||
    !meta.name.toLowerCase().endsWith(".pdf")
  ) {
    return { ok: false, error: errors.notPdf };
  }
  if (meta.size > maxUploadBytes || meta.size <= 0) {
    return { ok: false, error: errors.tooLarge };
  }
  return { ok: true };
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: errors.noFile }, { status: 400 });
  }
  const validation = validateUpload({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const container = getContainer();
  const id = crypto.randomUUID();
  const key = `documents/${id}/original.pdf`;
  try {
    await container.storage.put(
      key,
      new Uint8Array(await file.arrayBuffer()),
      "application/pdf",
    );
    const document = await container.documents.create({
      originalFilename: file.name,
      originalKey: key,
    });
    await container.queue.start();
    await container.queue.publish({ documentId: document.id });
    return NextResponse.json(
      { id: document.id, status: document.status },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: errors.uploadFailed }, { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  const rows = await getContainer().documents.list();
  return NextResponse.json({
    documents: rows.map((row) => ({
      id: row.id,
      originalFilename: row.originalFilename,
      status: row.status,
      pageCount: row.pageCount,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}
