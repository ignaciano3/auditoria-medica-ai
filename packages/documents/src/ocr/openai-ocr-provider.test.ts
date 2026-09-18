import { describe, expect, test } from "bun:test";
import {
  type OpenAICompatibleClient,
  OpenAIVisionOCRProvider,
} from "./openai-ocr-provider.ts";

type CapturedRequest = Record<string, unknown>;

function capturingClient(content: string | null): {
  client: OpenAICompatibleClient;
  requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];
  const client: OpenAICompatibleClient = {
    chat: {
      completions: {
        create: async (input) => {
          requests.push(input);
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
  return { client, requests };
}

function imageDetail(request: CapturedRequest): unknown {
  const messages = request.messages as Array<{ content: unknown }>;
  const user = messages.find((message) => Array.isArray(message.content)) as {
    content: Array<Record<string, unknown>>;
  };
  const image = user.content.find((part) => part.type === "image_url") as {
    image_url: { detail?: unknown };
  };
  return image.image_url.detail;
}

describe("OpenAIVisionOCRProvider", () => {
  test("parses a classification response", async () => {
    const { client } = capturingClient(
      JSON.stringify({
        docType: "lab",
        handwritten: false,
        dataBearing: true,
      }),
    );
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "test",
      model: "gpt-5.6-luna",
      client,
    });
    const result = await provider.classifyPage({
      pageNumber: 1,
      png: new Uint8Array([1, 2]),
    });
    expect(result.docType).toBe("lab");
    expect(result.handwritten).toBe(false);
    expect(result.dataBearing).toBe(true);
  });

  test("classifies with low image detail and low reasoning effort", async () => {
    const { client, requests } = capturingClient(
      JSON.stringify({ docType: "lab", handwritten: false, dataBearing: true }),
    );
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "test",
      model: "gpt-5.6-luna",
      client,
    });
    await provider.classifyPage({ pageNumber: 1, png: new Uint8Array([1, 2]) });
    expect(requests[0]?.reasoning_effort).toBe("low");
    expect(imageDetail(requests[0] ?? {})).toBe("low");
  });

  test("transcribes with high image detail", async () => {
    const { client, requests } = capturingClient("texto de prueba");
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "test",
      model: "gpt-5.6-luna",
      client,
    });
    await provider.transcribePage({
      pageNumber: 1,
      png: new Uint8Array([1, 2]),
    });
    expect(imageDetail(requests[0] ?? {})).toBe("high");
  });

  test("falls back safely when the response is invalid JSON", async () => {
    const { client } = capturingClient("not json at all");
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "test",
      model: "gpt-5.6-luna",
      client,
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
    const { client } = capturingClient(
      JSON.stringify({
        docType: "prescription",
        handwritten: true,
        dataBearing: true,
      }),
    );
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "test",
      model: "gpt-5.6-luna",
      client,
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
    const { client } = capturingClient("texto de prueba");
    const provider = new OpenAIVisionOCRProvider({
      apiKey: "test",
      model: "gpt-5.6-luna",
      client,
    });
    const result = await provider.transcribePage({
      pageNumber: 1,
      png: new Uint8Array([1, 2]),
    });
    expect(result).toBe("texto de prueba");
  });
});
