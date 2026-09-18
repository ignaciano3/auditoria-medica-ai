import { errors } from "@audit/lib";
import { NextResponse } from "next/server";
import { getContainer } from "../../../../lib/container.ts";
import { deleteDocumentById } from "../../../../lib/documents-service.ts";
import { serializeDocument } from "../../../../lib/serialize-document.ts";

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
  const [clinical, pages, reviews] = await Promise.all([
    container.clinicalRecords.getByDocument(id),
    container.pages.listForDocument(id),
    container.findingReviews.listForDocument(id),
  ]);
  return NextResponse.json({
    document: serializeDocument(row),
    record: clinical?.record ?? null,
    findings: clinical?.findings ?? [],
    reviews,
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
  const result = await deleteDocumentById(getContainer(), id);
  if (!result.ok && result.reason === "not_found") {
    return NextResponse.json({ error: errors.notFound }, { status: 404 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: errors.deleteFailed }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
