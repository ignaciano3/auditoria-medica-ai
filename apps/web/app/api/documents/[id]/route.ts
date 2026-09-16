import { errors } from "@audit/lib";
import { NextResponse } from "next/server";
import { getContainer } from "../../../../lib/container.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const row = await getContainer().documents.getById(id);
  if (!row) {
    return NextResponse.json({ error: errors.notFound }, { status: 404 });
  }
  return NextResponse.json({
    document: {
      id: row.id,
      originalFilename: row.originalFilename,
      status: row.status,
      pageCount: row.pageCount,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
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
  await container.storage.delete(row.originalKey);
  await container.documents.remove(id);
  return new Response(null, { status: 204 });
}
