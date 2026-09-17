import { describe, expect, test } from "bun:test";
import {
  clinicalRecord,
  documentStatusLabels,
  errors,
  failedPagesIndicator,
} from "./es.ts";

describe("documentStatusLabels", () => {
  test("every status has a Spanish label", () => {
    const values = Object.values(documentStatusLabels);
    expect(values).toContain("Subido");
    expect(values).toContain("Procesando");
    expect(values).toContain("Listo");
    expect(values.every((v) => v.length > 0)).toBe(true);
  });
});

describe("clinicalRecord labels", () => {
  test("exposes Spanish labels for every section", () => {
    expect(clinicalRecord.patient).toBe("Paciente");
    expect(clinicalRecord.diagnoses).toBe("Diagnósticos");
    expect(clinicalRecord.noInfo).toBe("No se encontró información suficiente");
    expect(
      Object.values(clinicalRecord).every((value) => value.length > 0),
    ).toBe(true);
  });

  test("formats failed page numbers", () => {
    expect(failedPagesIndicator([3, 5])).toBe("Páginas con error: 3, 5");
  });

  test("has the no-extractable-text error", () => {
    expect(errors.noExtractableText).toBe(
      "No se pudo extraer texto de ninguna página.",
    );
  });
});
