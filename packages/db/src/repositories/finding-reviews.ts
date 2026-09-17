import type { FindingReviewStatus } from "@audit/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { findingsReview } from "../schema.ts";

export type FindingReview = {
  findingId: string;
  status: FindingReviewStatus;
  note: string | null;
};

export function createFindingReviewRepository(db: Database) {
  return {
    async listForDocument(documentId: string): Promise<FindingReview[]> {
      return db
        .select({
          findingId: findingsReview.findingId,
          status: findingsReview.status,
          note: findingsReview.note,
        })
        .from(findingsReview)
        .where(eq(findingsReview.documentId, documentId));
    },
    async setStatus(
      documentId: string,
      findingId: string,
      status: FindingReviewStatus,
      note: string | null,
    ): Promise<void> {
      await db
        .insert(findingsReview)
        .values({ documentId, findingId, status, note })
        .onConflictDoUpdate({
          target: [findingsReview.documentId, findingsReview.findingId],
          set: { status, note, updatedAt: new Date() },
        });
    },
  };
}
