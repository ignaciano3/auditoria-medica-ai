import { describe, expect, mock, test } from "bun:test";

const constructedClients: Array<Record<string, unknown>> = [];

mock.module("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  docType: "lab",
                  handwritten: false,
                  dataBearing: true,
                }),
              },
            },
          ],
        }),
      },
    };

    constructor(options: Record<string, unknown>) {
      constructedClients.push(options);
    }
  },
}));

const { OpenAIVisionOCRProvider } = await import("./openai-ocr-provider.ts");

describe("OpenAIVisionOCRProvider client construction", () => {
  test("forwards baseURL to the OpenAI SDK client", async () => {
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "test",
      model: "deepseek-flash",
      baseURL: "https://api.deepseek.com",
    });
    await provider.classifyPage({ pageNumber: 1, png: new Uint8Array([1, 2]) });
    expect(constructedClients[0]?.baseURL).toBe("https://api.deepseek.com");
  });

  test("leaves baseURL unset when not provided", async () => {
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "test",
      model: "gpt-5.6-luna",
    });
    await provider.classifyPage({ pageNumber: 1, png: new Uint8Array([1, 2]) });
    expect(Object.hasOwn(constructedClients[1] ?? {}, "baseURL")).toBe(false);
  });
});
