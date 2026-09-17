import type { FindingReviewStatus } from "@audit/domain";
import { type ReviewInput, validateReviewInput } from "./findings-view.ts";

export type FindingReviewDeps = {
  findingReviews: {
    setStatus(
      documentId: string,
      findingId: string,
      status: FindingReviewStatus,
      note: string | null,
    ): Promise<void>;
  };
};

export type SaveFindingReviewResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveFindingReview(
  deps: FindingReviewDeps,
  input: ReviewInput,
): Promise<SaveFindingReviewResult> {
  const validation = validateReviewInput(input);
  if (!validation.ok) return validation;
  const { documentId, findingId, status, note } = validation.value;
  await deps.findingReviews.setStatus(documentId, findingId, status, note);
  return { ok: true };
}
