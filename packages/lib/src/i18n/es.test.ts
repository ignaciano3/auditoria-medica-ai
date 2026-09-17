import { describe, expect, test } from "bun:test";
import {
  clinicalRecord,
  deleteConfirm,
  documentStatusLabels,
  errors,
  failedChunksIndicator,
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

  test("formats the failed chunk count", () => {
    expect(failedChunksIndicator(2)).toBe("Fragmentos con error: 2");
  });

  test("has the no-extractable-text error", () => {
    expect(errors.noExtractableText).toBe(
      "No se pudo extraer texto de ninguna página.",
    );
  });

  test("has the extraction-failed error", () => {
    expect(errors.extractionFailed).toBe(
      "No se pudo extraer información del documento.",
    );
  });

  test("has the delete-failed error", () => {
    expect(errors.deleteFailed).toBe("No se pudo eliminar el documento.");
  });

  test("formats the delete confirmation with the file name", () => {
    expect(deleteConfirm("historia.pdf")).toBe(
      '¿Eliminar "historia.pdf"? Esta acción no se puede deshacer.',
    );
  });
});
