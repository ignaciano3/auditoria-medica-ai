import type { ClinicalRecordWithFindings, FindingReview } from "@audit/db";
import type { Document } from "@audit/domain";
import { cacheLife, cacheTag } from "next/cache";
import { DOCUMENTS_TAG, documentTag } from "./cache-tags.ts";
import { getContainer } from "./container.ts";
import { serializeDocument } from "./serialize-document.ts";

export async function getDocumentList(): Promise<Document[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(DOCUMENTS_TAG);
  const rows = await getContainer().documents.list();
  return rows.map((row) => serializeDocument(row));
}

export type CachedClinicalData = {
  clinical: ClinicalRecordWithFindings;
  reviews: FindingReview[];
};

export async function getClinicalData(
  documentId: string,
): Promise<CachedClinicalData | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(documentTag(documentId));
  const container = getContainer();
  const clinical = await container.clinicalRecords.getByDocument(documentId);
  if (!clinical) return null;
  const reviews = await container.findingReviews.listForDocument(documentId);
  return { clinical, reviews };
}
