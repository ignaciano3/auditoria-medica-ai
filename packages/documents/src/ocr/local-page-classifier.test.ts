import { describe, expect, test } from "bun:test";
import { LocalPageClassifier } from "./local-page-classifier.ts";

const page = { pageNumber: 1, png: new Uint8Array([1, 2]) };

describe("LocalPageClassifier", () => {
  test("marks every page as data-bearing without network calls", async () => {
    const classifier = new LocalPageClassifier();
    const result = await classifier.classifyPage(page);
    expect(result).toEqual({
      docType: "other",
      handwritten: false,
      dataBearing: true,
    });
  });
});
