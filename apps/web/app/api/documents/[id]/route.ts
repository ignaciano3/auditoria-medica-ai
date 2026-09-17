import { errors } from "@audit/lib";
import { NextResponse } from "next/server";
import { getContainer } from "../../../../lib/container.ts";
import { serializeDocument } from "../../../../lib/serialize-document.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const container = getContainer();
  const row = await container.documents.getById(id);
  if (!row) {
    return NextResponse.json({ error: errors.notFound }, { status: 404 });
  }
  const [clinical, pages] = await Promise.all([
    container.clinicalRecords.getByDocument(id),
    container.pages.listForDocument(id),
  ]);
  return NextResponse.json({
    document: serializeDocument(row),
    record: clinical?.record ?? null,
    extractionIncomplete: clinical?.extractionIncomplete ?? false,
    failedChunkCount: clinical?.failedChunkCount ?? 0,
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      status: page.status,
      docType: page.docType,
    })),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const container = getContainer();
  const row = await container.documents.getById(id);
  if (!row) {
    return NextResponse.json({ error: errors.notFound }, { status: 404 });
  }
  await container.documents.remove(id);
  await container.storage.delete(row.originalKey).catch(() => undefined);
  return new Response(null, { status: 204 });
}
