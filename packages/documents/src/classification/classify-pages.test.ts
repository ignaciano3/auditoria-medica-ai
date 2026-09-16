import { describe, expect, test } from "bun:test";
import type { OCRProvider } from "../ocr/ocr-provider.ts";
import { classifyPages } from "./classify-pages.ts";

const stub = (
  overrides: Partial<Awaited<ReturnType<OCRProvider["classifyPage"]>>>,
) => {
  const provider: OCRProvider = {
    classifyPage: async () => ({
      docType: "evolution",
      handwritten: false,
      dataBearing: true,
      ...overrides,
    }),
    transcribePage: async () => "",
  };
  return provider;
};

describe("classifyPages", () => {
  test("classifies each page and marks flowsheets non-data-bearing", async () => {
    const pages = [{ pageNumber: 1, png: new Uint8Array([1]) }];
    const result = await classifyPages(
      pages,
      stub({ docType: "flowsheet", handwritten: true, dataBearing: false }),
    );
    expect(result[0]?.docType).toBe("flowsheet");
    expect(result[0]?.status).toBe("pending");
  });

  test("degrades gracefully when the provider throws", async () => {
    const provider: OCRProvider = {
      classifyPage: async () => {
        throw new Error("provider down");
      },
      transcribePage: async () => "",
    };
    const result = await classifyPages(
      [{ pageNumber: 1, png: new Uint8Array([1]) }],
      provider,
    );
    expect(result[0]?.docType).toBe("other");
    expect(result[0]?.dataBearing).toBe(true);
  });
});
