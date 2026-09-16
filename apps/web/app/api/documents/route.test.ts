import { describe, expect, test } from "bun:test";
import { validateUpload } from "./route.ts";

describe("validateUpload", () => {
  test("accepts a PDF", () => {
    const result = validateUpload({
      name: "historia.pdf",
      type: "application/pdf",
      size: 1024,
    });
    expect(result.ok).toBe(true);
  });
  test("rejects a non-PDF with a Spanish error", () => {
    const result = validateUpload({
      name: "foto.png",
      type: "image/png",
      size: 1024,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("El archivo debe ser un PDF.");
  });
  test("rejects oversized files", () => {
    const result = validateUpload({
      name: "grande.pdf",
      type: "application/pdf",
      size: 999_999_999,
    });
    expect(result.ok).toBe(false);
  });
});
