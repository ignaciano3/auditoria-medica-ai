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

describe("OpenAIProvider client construction", () => {
  test("forwards baseURL to the OpenAI SDK client", async () => {
    const provider = new OpenAIProvider({
      apiKey: "t",
      model: "qwen3.8-flash",
      baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    });
    await provider.generateClinicalSummary(record);
    expect(constructedClients[0]?.baseURL).toBe(
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    );
  });

  test("leaves baseURL unset when not provided", async () => {
    const provider = new OpenAIProvider({
      apiKey: "t",
      model: "gpt-5.6-terra",
    });
    await provider.generateClinicalSummary(record);
    expect(Object.hasOwn(constructedClients[1] ?? {}, "baseURL")).toBe(false);
  });
});
