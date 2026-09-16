import { describe, expect, test } from "bun:test";
import { documentStatusLabels } from "./es.ts";

describe("documentStatusLabels", () => {
  test("every status has a Spanish label", () => {
    const values = Object.values(documentStatusLabels);
    expect(values).toContain("Subido");
    expect(values).toContain("Procesando");
    expect(values).toContain("Listo");
    expect(values.every((v) => v.length > 0)).toBe(true);
  });
});
