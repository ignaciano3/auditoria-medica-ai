import { describe, expect, test } from "bun:test";
import { pageIndicator, processing, ui } from "@audit/lib/i18n";
import {
  clampPage,
  type PageTranscriptInput,
  pageTranscript,
} from "./pdf-viewer-utils.ts";

function page(
  overrides: Partial<PageTranscriptInput> = {},
): PageTranscriptInput {
  return { pageNumber: 1, text: "", status: "pending", ...overrides };
}

describe("clampPage", () => {
  test("clamps to valid bounds", () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(3, 5)).toBe(3);
  });
  test("returns 1 when the document has no pages", () => {
    expect(clampPage(3, 0)).toBe(1);
  });
});

describe("pageIndicator", () => {
  test("formats the Spanish page indicator", () => {
    expect(pageIndicator(2, 7)).toBe("Página 2 de 7");
  });
});

describe("pageTranscript", () => {
  test("returns the transcription of a text page", () => {
    expect(pageTranscript(page({ status: "text", text: "  Hola  " }))).toEqual({
      kind: "text",
      text: "Hola",
    });
  });

  test("returns the transcription of a vision page", () => {
    expect(
      pageTranscript(page({ status: "vision", text: "Transcrito" })),
    ).toEqual({ kind: "text", text: "Transcrito" });
  });

  test("reports an empty transcription", () => {
    expect(pageTranscript(page({ status: "text", text: "   " }))).toEqual({
      kind: "status",
      message: ui.noTranscription,
    });
  });

  test("uses the skip reason of a skipped page", () => {
    expect(
      pageTranscript(
        page({ status: "skipped", skipReason: processing.flowsheetSkipped }),
      ),
    ).toEqual({ kind: "status", message: processing.flowsheetSkipped });
  });

  test("falls back to the not-data-bearing reason when skipped", () => {
    expect(pageTranscript(page({ status: "skipped" }))).toEqual({
      kind: "status",
      message: processing.notDataBearing,
    });
  });

  test("reports a failed page", () => {
    expect(pageTranscript(page({ status: "failed" }))).toEqual({
      kind: "status",
      message: processing.failed,
    });
  });

  test("reports a pending or unknown page as pending", () => {
    expect(pageTranscript(page({ status: "pending" }))).toEqual({
      kind: "status",
      message: processing.pending,
    });
    expect(pageTranscript(undefined)).toEqual({
      kind: "status",
      message: processing.pending,
    });
  });
});
