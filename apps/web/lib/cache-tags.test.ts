import { describe, expect, test } from "bun:test";
import { DOCUMENTS_TAG, documentTag } from "./cache-tags.ts";

describe("cache tags", () => {
  test("documents list tag is stable", () => {
    expect(DOCUMENTS_TAG).toBe("documents");
  });
  test("document tag is scoped per document", () => {
    expect(documentTag("abc")).toBe("document:abc");
    expect(documentTag("abc")).not.toBe(documentTag("def"));
  });
});
