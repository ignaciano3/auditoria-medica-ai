import { describe, expect, test } from "bun:test";
import { pageIndicator } from "@audit/lib/i18n";
import { clampPage } from "./pdf-viewer-utils.ts";

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
