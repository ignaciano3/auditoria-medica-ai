import { describe, expect, test } from "bun:test";
import type { FindingReviewStatus } from "@audit/domain";
import { errors } from "@audit/lib/i18n";
import {
  type FindingReviewDeps,
  saveFindingReview,
} from "./findings-service.ts";

type Call = [string, string, FindingReviewStatus, string | null];

function makeDeps(): { deps: FindingReviewDeps; calls: Call[] } {
  const calls: Call[] = [];
  const deps: FindingReviewDeps = {
    findingReviews: {
      setStatus: (documentId, findingId, status, note) => {
        calls.push([documentId, findingId, status, note]);
        return Promise.resolve();
      },
    },
  };
  return { deps, calls };
}

describe("saveFindingReview", () => {
  test("persists a valid review with a trimmed note", async () => {
    const { deps, calls } = makeDeps();
    const result = await saveFindingReview(deps, {
      documentId: "d1",
      findingId: "fnd-1",
      status: "reviewed",
      note: "  ok  ",
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([["d1", "fnd-1", "reviewed", "ok"]]);
  });

  test("converts a blank note to null", async () => {
    const { deps, calls } = makeDeps();
    await saveFindingReview(deps, {
      documentId: "d1",
      findingId: "fnd-1",
      status: "pending",
      note: "   ",
    });
    expect(calls).toEqual([["d1", "fnd-1", "pending", null]]);
  });

  test("rejects an invalid status without touching the repository", async () => {
    const { deps, calls } = makeDeps();
    const result = await saveFindingReview(deps, {
      documentId: "d1",
      findingId: "fnd-1",
      status: "bogus",
    });
    expect(result).toEqual({ ok: false, error: errors.invalidReviewStatus });
    expect(calls).toEqual([]);
  });

  test("rejects an over-long note without touching the repository", async () => {
    const { deps, calls } = makeDeps();
    const result = await saveFindingReview(deps, {
      documentId: "d1",
      findingId: "fnd-1",
      status: "reviewed",
      note: "x".repeat(2001),
    });
    expect(result).toEqual({ ok: false, error: errors.noteTooLong });
    expect(calls).toEqual([]);
  });
});
