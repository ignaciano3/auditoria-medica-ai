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
                  docType: "other",
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

describe("OpenAIVisionOCRProvider default headers", () => {
  test("forwards defaultHeaders to the OpenAI SDK client", async () => {
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "t",
      model: "deepseek-v4-flash-vision-exp",
      baseURL: "https://opencode.ai/zen/go/v1",
      defaultHeaders: {
        "User-Agent": "auditoria-medica-ai/1.0",
        "x-opencode-session": "document:abc",
      },
    });
    await provider.classifyPage({
      pageNumber: 1,
      png: new Uint8Array([137, 80, 78, 71]),
    });
    expect(constructedClients[0]?.defaultHeaders).toEqual({
      "User-Agent": "auditoria-medica-ai/1.0",
      "x-opencode-session": "document:abc",
    });
  });
});
