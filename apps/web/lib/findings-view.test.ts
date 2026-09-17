import { describe, expect, test } from "bun:test";
import type { FindingReview } from "@audit/db";
import type { Finding } from "@audit/domain";
import { errors } from "@audit/lib/i18n";
import {
  countBySeverity,
  countByStatus,
  filterFindings,
  reviewStatusOf,
  sortFindings,
  validateReviewInput,
} from "./findings-view.ts";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "fnd-1",
    severity: "medium",
    category: "temporal",
    title: "Título",
    explanation: "explicación",
    evidence: [
      {
        source: { documentId: "d1", pageNumber: 1, text: "t" },
        relevance: "r",
      },
    ],
    requiresHumanReview: true,
    ...overrides,
  };
}

function review(
  findingId: string,
  status: FindingReview["status"],
  note: string | null = null,
): FindingReview {
  return { findingId, status, note };
}

describe("sortFindings", () => {
  test("orders by severity high to info, then category, then title", () => {
    const sorted = sortFindings([
      finding({ id: "low", severity: "low", title: "Z" }),
      finding({ id: "high", severity: "high", title: "B" }),
      finding({ id: "info", severity: "info", title: "A" }),
      finding({ id: "high2", severity: "high", title: "A" }),
      finding({ id: "medium", severity: "medium", title: "C" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual([
      "high2",
      "high",
      "medium",
      "low",
      "info",
    ]);
  });

  test("does not mutate the input array", () => {
    const input = [
      finding({ id: "a" }),
      finding({ id: "b", severity: "info" }),
    ];
    const copy = [...input];
    sortFindings(input);
    expect(input).toEqual(copy);
  });
});

describe("reviewStatusOf", () => {
  test("defaults to pending when there is no review row", () => {
    expect(reviewStatusOf([], "fnd-1")).toBe("pending");
  });

  test("returns the stored status", () => {
    expect(reviewStatusOf([review("fnd-1", "dismissed")], "fnd-1")).toBe(
      "dismissed",
    );
  });
});

describe("filterFindings", () => {
  const findings = [
    finding({ id: "a" }),
    finding({ id: "b" }),
    finding({ id: "c" }),
  ];
  const reviews = [review("a", "reviewed"), review("b", "dismissed")];

  test("returns everything for the all filter", () => {
    expect(filterFindings(findings, reviews, "all")).toHaveLength(3);
  });

  test("treats findings without a row as pending", () => {
    expect(
      filterFindings(findings, reviews, "pending").map((f) => f.id),
    ).toEqual(["c"]);
  });

  test("filters reviewed and dismissed", () => {
    expect(
      filterFindings(findings, reviews, "reviewed").map((f) => f.id),
    ).toEqual(["a"]);
    expect(
      filterFindings(findings, reviews, "dismissed").map((f) => f.id),
    ).toEqual(["b"]);
  });
});

describe("countBySeverity", () => {
  test("counts each severity", () => {
    expect(
      countBySeverity([
        finding({ severity: "high" }),
        finding({ severity: "high" }),
        finding({ severity: "info" }),
      ]),
    ).toEqual({ high: 2, medium: 0, low: 0, info: 1 });
  });
});

describe("countByStatus", () => {
  test("counts pending for missing rows", () => {
    expect(
      countByStatus(
        [finding({ id: "a" }), finding({ id: "b" }), finding({ id: "c" })],
        [review("a", "reviewed"), review("b", "dismissed")],
      ),
    ).toEqual({ pending: 1, reviewed: 1, dismissed: 1 });
  });
});

describe("validateReviewInput", () => {
  test("accepts a valid status and trims the note", () => {
    expect(
      validateReviewInput({
        documentId: "d1",
        findingId: "fnd-1",
        status: "reviewed",
        note: "  ok  ",
      }),
    ).toEqual({
      ok: true,
      value: {
        documentId: "d1",
        findingId: "fnd-1",
        status: "reviewed",
        note: "ok",
      },
    });
  });

  test("converts a blank note to null", () => {
    const result = validateReviewInput({
      documentId: "d1",
      findingId: "fnd-1",
      status: "pending",
      note: "   ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.note).toBeNull();
  });

  test("omitting the note yields null", () => {
    const result = validateReviewInput({
      documentId: "d1",
      findingId: "fnd-1",
      status: "dismissed",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.note).toBeNull();
  });

  test("rejects an unknown status", () => {
    expect(
      validateReviewInput({
        documentId: "d1",
        findingId: "fnd-1",
        status: "bogus",
      }),
    ).toEqual({ ok: false, error: errors.invalidReviewStatus });
  });

  test("rejects an empty document or finding id", () => {
    expect(
      validateReviewInput({
        documentId: " ",
        findingId: "fnd-1",
        status: "reviewed",
      }),
    ).toEqual({ ok: false, error: errors.invalidFinding });
    expect(
      validateReviewInput({
        documentId: "d1",
        findingId: "",
        status: "reviewed",
      }),
    ).toEqual({ ok: false, error: errors.invalidFinding });
  });

  test("rejects a note longer than the maximum", () => {
    expect(
      validateReviewInput({
        documentId: "d1",
        findingId: "fnd-1",
        status: "reviewed",
        note: "x".repeat(2001),
      }),
    ).toEqual({ ok: false, error: errors.noteTooLong });
  });
});
