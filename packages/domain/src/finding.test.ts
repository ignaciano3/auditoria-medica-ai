import { describe, expect, test } from "bun:test";
import type { Finding } from "./finding.ts";
import { assignStableFindingIds, findingSignature } from "./finding.ts";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "provider-id",
    severity: "high",
    category: "temporal",
    title: "Posible inconsistencia temporal",
    explanation: "explicación",
    evidence: [
      {
        source: { documentId: "d1", pageNumber: 3, text: "texto" },
        relevance: "relevancia",
      },
    ],
    requiresHumanReview: true,
    ...overrides,
  };
}

describe("findingSignature", () => {
  test("normalizes case, accents, punctuation and whitespace", () => {
    const a = makeFinding({ title: "Posible  inconsistencia TEMPORAL." });
    const b = makeFinding({ title: "posible inconsistencia temporal" });
    expect(findingSignature(a)).toBe(findingSignature(b));
  });

  test("ignores the provider-assigned id", () => {
    expect(findingSignature(makeFinding({ id: "x" }))).toBe(
      findingSignature(makeFinding({ id: "y" })),
    );
  });

  test("changes when the evidence page changes", () => {
    const other = makeFinding({
      evidence: [
        {
          source: { documentId: "d1", pageNumber: 4, text: "t" },
          relevance: "r",
        },
      ],
    });
    expect(findingSignature(makeFinding())).not.toBe(findingSignature(other));
  });
});

describe("assignStableFindingIds", () => {
  test("is stable across runs for the same content", () => {
    const first = assignStableFindingIds([makeFinding()]);
    const second = assignStableFindingIds([makeFinding()]);
    expect(first.map((finding) => finding.id)).toEqual(
      second.map((finding) => finding.id),
    );
    expect(first[0]?.id.startsWith("fnd-")).toBe(true);
  });

  test("does not depend on input order", () => {
    const a = makeFinding({ category: "temporal", title: "Alfa" });
    const b = makeFinding({ category: "medication", title: "Beta" });
    const forward = assignStableFindingIds([a, b]).map((finding) => finding.id);
    const backward = assignStableFindingIds([b, a]).map(
      (finding) => finding.id,
    );
    expect([...forward].sort()).toEqual([...backward].sort());
  });

  test("disambiguates duplicate signatures", () => {
    const ids = assignStableFindingIds([makeFinding(), makeFinding()]).map(
      (finding) => finding.id,
    );
    expect(new Set(ids).size).toBe(2);
    expect(ids.some((id) => id.endsWith("-2"))).toBe(true);
  });

  test("preserves input order", () => {
    const a = makeFinding({ category: "temporal", title: "Alfa" });
    const b = makeFinding({ category: "medication", title: "Beta" });
    const ids = assignStableFindingIds([a, b]).map((finding) => finding.id);
    expect(ids[0]).toBe(assignStableFindingIds([a]).map((f) => f.id)[0]);
  });
});
