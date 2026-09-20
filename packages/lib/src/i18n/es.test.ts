import { describe, expect, test } from "bun:test";
import {
  clinicalRecord,
  deleteConfirm,
  documentStatusLabels,
  errors,
  failedChunksIndicator,
  failedPagesIndicator,
  medicationStatusLabels,
  pageProgress,
  settings,
  settingsMissingKey,
  ui,
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

describe("clinicalRecord full-view labels", () => {
  test("labels birth date and history in Spanish", () => {
    expect(clinicalRecord.birthDate).toBe("Fecha de nacimiento");
    expect(clinicalRecord.pathological).toBe("Antecedentes patológicos");
    expect(clinicalRecord.allergies).toBe("Alergias");
  });

  test("labels discharge and item fields in Spanish", () => {
    expect(clinicalRecord.discharge).toBe("Alta");
    expect(clinicalRecord.conditionAtDischarge).toBe("Condición al alta");
    expect(clinicalRecord.referenceRange).toBe("Valor de referencia");
    expect(clinicalRecord.sensitivity).toBe("Sensibilidad");
  });

  test("labels date conflicts and the cautious note", () => {
    expect(clinicalRecord.admissionDateConflicts).toBe(
      "Fechas de ingreso contradictorias",
    );
    expect(clinicalRecord.dischargeDateConflicts).toBe(
      "Fechas de alta contradictorias",
    );
    expect(clinicalRecord.dateConflictNote).toContain(
      "Revisar la documentación original",
    );
  });

  test("labels invalid placeholder values", () => {
    expect(clinicalRecord.invalidValue).toBe("inválido");
  });
});

describe("ui viewer and chat labels", () => {
  test("labels the image tab", () => {
    expect(ui.image).toBe("Imagen");
  });

  test("formats the transcription progress", () => {
    expect(pageProgress(3, 24)).toBe("3 de 24 páginas transcritas");
  });

  test("labels the chat input and send action", () => {
    expect(ui.chatPlaceholder).toBe("Escribí tu pregunta…");
    expect(ui.chatSend).toBe("Enviar");
  });

  test("provides the empty-chat invitation", () => {
    expect(ui.chatEmptyTitle.length).toBeGreaterThan(0);
    expect(ui.chatEmptyBody.length).toBeGreaterThan(0);
  });

  test("provides empty-chat suggestions", () => {
    expect(ui.chatSuggestions.length).toBeGreaterThan(0);
    expect(
      ui.chatSuggestions.every((suggestion) => suggestion.length > 0),
    ).toBe(true);
  });

  test("provides chat status and error copy", () => {
    expect(ui.chatThinking.length).toBeGreaterThan(0);
    expect(ui.chatError.length).toBeGreaterThan(0);
    expect(ui.chatNotReady.length).toBeGreaterThan(0);
    expect(ui.chatInvalid.length).toBeGreaterThan(0);
  });
});

describe("medicationStatusLabels", () => {
  test("maps every medication status to Spanish", () => {
    expect(medicationStatusLabels).toEqual({
      active: "Activa",
      stopped: "Suspendida",
      unknown: "Desconocida",
    });
  });
});

describe("settings copy", () => {
  test("provides a non-empty Spanish label for every settings string", () => {
    expect(settings.title.length).toBeGreaterThan(0);
    expect(settings.description.length).toBeGreaterThan(0);
    expect(settings.save.length).toBeGreaterThan(0);
    expect(Object.values(settings).every((value) => value.length > 0)).toBe(
      true,
    );
  });
});

describe("settings errors", () => {
  test("exposes the new settings error messages", () => {
    expect(errors.settingsNoEncryptionKey).toBe(
      "Falta SETTINGS_ENCRYPTION_KEY en el entorno: no se pueden guardar claves.",
    );
    expect(errors.settingsInvalidProvider).toBe("Proveedor no válido.");
    expect(errors.settingsInvalidModel).toBe(
      "El modelo no corresponde al proveedor seleccionado.",
    );
    expect(errors.settingsSaveFailed).toBe(
      "No se pudo guardar la configuración.",
    );
  });

  test("names the provider in the missing-key message", () => {
    const message = settingsMissingKey("opencode");
    expect(message.length).toBeGreaterThan(0);
    expect(message).toContain("opencode");
  });
});
