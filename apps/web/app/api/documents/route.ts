import { errors } from "@audit/lib";
import { NextResponse } from "next/server";
import { getContainer } from "../../../lib/container.ts";
import {
  createUploadedDocument,
  maxUploadBytes,
  type UploadMeta,
  validateUpload,
} from "../../../lib/documents-service.ts";
import { serializeDocument } from "../../../lib/serialize-document.ts";

export { maxUploadBytes, type UploadMeta, validateUpload };

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: errors.noFile }, { status: 400 });
  }
  const result = await createUploadedDocument(getContainer(), file);
  if (!result.ok) {
    const status = result.reason === "invalid" ? 400 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(
    { id: result.id, status: result.status },
    { status: 201 },
  );
}

export async function GET(): Promise<Response> {
  const rows = await getContainer().documents.list();
  return NextResponse.json({
    documents: rows.map((row) => serializeDocument(row)),
  });
}
