import { describe, expect, test } from "bun:test";
import type { DocumentPage } from "@audit/domain";
import {
  buildEditProposal,
  buildEditProposalUserPrompt,
  chatIntentSchema,
  EDIT_PROPOSAL_SYSTEM_PROMPT,
  escapeRegExp,
  replaceLiteral,
  replaceLiteralDeep,
  resolveTargetPage,
} from "./edit-proposal.ts";

function page(pageNumber: number, text: string): DocumentPage {
  return {
    pageNumber,
    text,
    docType: "evolution",
    handwritten: false,
    dataBearing: true,
    status: "vision",
  };
}

describe("chatIntentSchema", () => {
  test("accepts a question", () => {
    expect(chatIntentSchema.parse({ kind: "question" })).toEqual({
      kind: "question",
    });
  });

  test("accepts an edit with an optional page number", () => {
    expect(
      chatIntentSchema.parse({
        kind: "edit",
        incorrect: "Ansel",
        correct: "Ariel",
      }),
    ).toEqual({ kind: "edit", incorrect: "Ansel", correct: "Ariel" });
    expect(
      chatIntentSchema.parse({
        kind: "edit",
        pageNumber: 3,
        incorrect: "Ansel",
        correct: "Ariel",
      }),
    ).toEqual({
      kind: "edit",
      pageNumber: 3,
      incorrect: "Ansel",
      correct: "Ariel",
    });
  });

  test("rejects an incorrect literal shorter than 2 characters", () => {
    expect(
      chatIntentSchema.safeParse({ kind: "edit", incorrect: "a", correct: "b" })
        .success,
    ).toBe(false);
  });
});

describe("escapeRegExp / replaceLiteral", () => {
  test("escapes regex metacharacters", () => {
    expect(escapeRegExp("a.b*c")).toBe("a\\.b\\*c");
  });

  test("replaces every case-insensitive occurrence and counts them", () => {
    expect(replaceLiteral("Ansel y ansel y ANSEL", "ansel", "Ariel")).toEqual({
      text: "Ariel y Ariel y Ariel",
      occurrences: 3,
    });
  });

  test("reports zero occurrences when the literal is absent", () => {
    expect(replaceLiteral("Paciente Ana", "Ansel", "Ariel")).toEqual({
      text: "Paciente Ana",
      occurrences: 0,
    });
  });

  test("inserts dollar sequences in the replacement literally", () => {
    expect(replaceLiteral("Ansel", "Ansel", "Sr. $& $$")).toEqual({
      text: "Sr. $& $$",
      occurrences: 1,
    });
  });
});

describe("replaceLiteralDeep", () => {
  test("walks nested objects and arrays, touching only strings", () => {
    const input = {
      name: { value: "Ansel", code: 7 },
      list: ["Ansel", { note: "sin Ansel" }, 3, null],
    };
    const result = replaceLiteralDeep(input, "Ansel", "Ariel");
    expect(result.occurrences).toBe(3);
    expect(result.value).toEqual({
      name: { value: "Ariel", code: 7 },
      list: ["Ariel", { note: "sin Ariel" }, 3, null],
    });
  });

  test("does not mutate the input", () => {
    const input = { name: "Ansel" };
    replaceLiteralDeep(input, "Ansel", "Ariel");
    expect(input.name).toBe("Ansel");
  });
});

describe("resolveTargetPage", () => {
  const pages = [page(1, "Primera"), page(3, "Paciente Ansel")];

  test("uses the explicit page number", () => {
    const result = resolveTargetPage(pages, {
      kind: "edit",
      pageNumber: 3,
      incorrect: "Ansel",
      correct: "Ariel",
    });
    expect(result.ok && result.page.pageNumber).toBe(3);
  });

  test("finds a single page containing the literal", () => {
    const result = resolveTargetPage(pages, {
      kind: "edit",
      incorrect: "Ansel",
      correct: "Ariel",
    });
    expect(result.ok && result.page.pageNumber).toBe(3);
  });

  test("returns notFound when no page contains it", () => {
    expect(
      resolveTargetPage(pages, {
        kind: "edit",
        incorrect: "Zzz",
        correct: "Ariel",
      }),
    ).toEqual({ ok: false, reason: "notFound" });
  });

  test("returns ambiguous when several pages contain it", () => {
    const repeated = [page(1, "Ansel"), page(2, "Ansel")];
    expect(
      resolveTargetPage(repeated, {
        kind: "edit",
        incorrect: "Ansel",
        correct: "Ariel",
      }),
    ).toEqual({ ok: false, reason: "ambiguous" });
  });
});

describe("buildEditProposal", () => {
  test("returns the resulting page text and occurrence count", () => {
    const result = buildEditProposal([page(3, "Ansel / ansel")], {
      kind: "edit",
      pageNumber: 3,
      incorrect: "Ansel",
      correct: "Ariel",
    });
    expect(result).toEqual({
      ok: true,
      proposal: {
        pageNumber: 3,
        incorrect: "Ansel",
        correct: "Ariel",
        occurrences: 2,
        resultingText: "Ariel / Ariel",
      },
    });
  });

  test("returns noMatch when the named page has no literal", () => {
    expect(
      buildEditProposal([page(3, "Paciente Ana")], {
        kind: "edit",
        pageNumber: 3,
        incorrect: "Ansel",
        correct: "Ariel",
      }),
    ).toEqual({ ok: false, reason: "noMatch" });
  });
});

describe("buildEditProposalUserPrompt", () => {
  test("includes pages, history and the message", () => {
    const prompt = buildEditProposalUserPrompt({
      question: "en la pagina 3 dice Ariel no Ansel",
      history: [{ role: "user", content: "turno previo" }],
      pages: [{ pageNumber: 3, text: "Paciente Ansel", score: 1 }],
    });
    expect(prompt).toContain('<page n="3">');
    expect(prompt).toContain("Paciente Ansel");
    expect(prompt).toContain("turno previo");
    expect(prompt).toContain("en la pagina 3 dice Ariel no Ansel");
    expect(EDIT_PROPOSAL_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });
});
