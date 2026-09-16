import { errors } from "@audit/lib";
import { NextResponse } from "next/server";
import { getContainer } from "../../../../../../lib/container.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; page: string }> },
): Promise<Response> {
  const { id, page } = await params;
  const pageNumber = Number(page);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: errors.notFound }, { status: 404 });
  }
  const container = getContainer();
  const row = await container.pages.getPage(id, pageNumber);
  if (!row?.imageKey) {
    return NextResponse.json({ error: errors.notFound }, { status: 404 });
  }
  const bytes = await container.storage.get(row.imageKey);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
