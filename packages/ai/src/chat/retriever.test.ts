import { describe, expect, test } from "bun:test";
import type { DocumentPage } from "@audit/domain";
import { retrievePages, tokenize } from "./retriever.ts";

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

describe("tokenize", () => {
  test("lowercases, strips accents and drops stopwords and short tokens", () => {
    expect(
      tokenize("¿Qué MEDICACIÓN recibió el paciente de la guardia?"),
    ).toEqual(["medicacion", "recibio", "paciente", "guardia"]);
  });
});

describe("retrievePages", () => {
  test("ranks the page sharing more question terms first", () => {
    const result = retrievePages(
      [
        page(1, "Evolución general del paciente sin cambios."),
        page(2, "Levofloxacina: se inicia antibiótico."),
        page(3, "Antibiótico de amplio espectro."),
      ],
      "¿Qué antibiótico levofloxacina recibió?",
    );
    expect(result.map((r) => r.pageNumber)).toEqual([2, 3]);
    expect(result[0]?.score).toBeGreaterThan(result[1]?.score ?? 0);
  });

  test("ignores empty, failed and skipped pages", () => {
    const failed = { ...page(2, "levofloxacina"), status: "failed" as const };
    const skipped = { ...page(3, "levofloxacina"), status: "skipped" as const };
    const result = retrievePages(
      [page(1, ""), failed, skipped, page(4, "levofloxacina")],
      "levofloxacina",
    );
    expect(result.map((r) => r.pageNumber)).toEqual([4]);
  });

  test("returns [] when nothing overlaps", () => {
    const result = retrievePages(
      [page(1, "control de signos vitales")],
      "marfan",
    );
    expect(result).toEqual([]);
  });

  test("caps the number of pages", () => {
    const pages = Array.from({ length: 10 }, (_, i) =>
      page(i + 1, `antibiotico ${i}`),
    );
    expect(retrievePages(pages, "antibiotico", { maxPages: 3 })).toHaveLength(
      3,
    );
  });
});
