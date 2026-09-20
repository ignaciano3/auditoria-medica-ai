import { describe, expect, mock, test } from "bun:test";

const constructedClients: Array<Record<string, unknown>> = [];

mock.module("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: async () => ({
          choices: [{ message: { content: "Resumen clínico." } }],
        }),
      },
    };

    constructor(options: Record<string, unknown>) {
      constructedClients.push(options);
    }
  },
}));

const { OpenAIProvider } = await import("../../index.ts");

const record = {
  patient: {},
  hospitalization: { diagnoses: [] },
  history: { pathological: [], allergies: [], usualMedications: [] },
  medications: [],
  laboratory: [],
  studies: [],
  microbiology: [],
  clinicalEvents: [],
} as Parameters<
  InstanceType<typeof OpenAIProvider>["generateClinicalSummary"]
>[0];

describe("OpenAIProvider default headers", () => {
  test("forwards defaultHeaders to the OpenAI SDK client", async () => {
    const provider = new OpenAIProvider({
      apiKey: "t",
      model: "deepseek-v4.1-flash",
      baseURL: "https://opencode.ai/zen/go/v1",
      defaultHeaders: {
        "User-Agent": "auditoria-medica-ai/1.0",
        "x-opencode-session": "document:abc",
      },
    });
    await provider.generateClinicalSummary(record);
    expect(constructedClients[0]?.defaultHeaders).toEqual({
      "User-Agent": "auditoria-medica-ai/1.0",
      "x-opencode-session": "document:abc",
    });
  });
});
