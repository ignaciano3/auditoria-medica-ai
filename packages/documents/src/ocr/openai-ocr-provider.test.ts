import { describe, expect, test } from "bun:test";
import {
  type OpenAICompatibleClient,
  OpenAIVisionOCRProvider,
} from "./openai-ocr-provider.ts";

function fakeClient(content: string | null): OpenAICompatibleClient {
  return {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content } }] }),
      },
    },
  };
}

describe("OpenAIVisionOCRProvider", () => {
  test("parses a classification response", async () => {
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "test",
      model: "gpt-4.1",
      client: fakeClient(
        JSON.stringify({
          docType: "lab",
          handwritten: false,
          dataBearing: true,
        }),
      ),
    });
    const result = await provider.classifyPage({
      pageNumber: 1,
      png: new Uint8Array([1, 2]),
    });
    expect(result.docType).toBe("lab");
    expect(result.handwritten).toBe(false);
    expect(result.dataBearing).toBe(true);
  });

  test("falls back safely when the response is invalid JSON", async () => {
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "test",
      model: "gpt-4.1",
      client: fakeClient("not json at all"),
    });
    const result = await provider.classifyPage({
      pageNumber: 1,
      png: new Uint8Array([1, 2]),
    });
    expect(result).toEqual({
      docType: "other",
      handwritten: false,
      dataBearing: true,
    });
  });

  test("falls back safely when the docType is not allowed", async () => {
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "test",
      model: "gpt-4.1",
      client: fakeClient(
        JSON.stringify({
          docType: "prescription",
          handwritten: true,
          dataBearing: true,
        }),
      ),
    });
    const result = await provider.classifyPage({
      pageNumber: 1,
      png: new Uint8Array([1, 2]),
    });
    expect(result).toEqual({
      docType: "other",
      handwritten: false,
      dataBearing: true,
    });
  });

  test("returns the model text when transcribing", async () => {
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "test",
      model: "gpt-4.1",
      client: fakeClient("texto de prueba"),
    });
    const result = await provider.transcribePage({
      pageNumber: 1,
      png: new Uint8Array([1, 2]),
    });
    expect(result).toBe("texto de prueba");
  });
});
