import { describe, expect, test } from "bun:test";
import type { DocumentPage } from "@audit/domain";
import {
  LLMExtractionError,
  type OpenAICompatibleClient,
  OpenAIProvider,
} from "../../index.ts";

const page: DocumentPage = {
  pageNumber: 1,
  text: "texto",
  docType: "evolution",
  handwritten: false,
  dataBearing: true,
  status: "vision",
};

const validRecord = {
  patient: {},
  hospitalization: { diagnoses: [] },
  history: { pathological: [], allergies: [], usualMedications: [] },
  medications: [],
  laboratory: [],
  studies: [],
  microbiology: [],
  clinicalEvents: [],
};

const validFinding = {
  id: "f1",
  severity: "medium",
  category: "temporal",
  title: "Posible inconsistencia temporal",
  explanation: "Las fechas no coinciden.",
  evidence: [
    {
      source: { documentId: "d1", pageNumber: 1, text: "ingreso" },
      relevance: "Fecha de ingreso documentada.",
    },
  ],
  requiresHumanReview: true,
};

function sequencedClient(contents: Array<string | null>): {
  client: OpenAICompatibleClient;
  calls: () => number;
  requests: Array<Record<string, unknown>>;
} {
  let calls = 0;
  const requests: Array<Record<string, unknown>> = [];
  const client: OpenAICompatibleClient = {
    chat: {
      completions: {
        create: async (input) => {
          requests.push(input);
          const index = Math.min(calls, contents.length - 1);
          calls += 1;
          return {
            choices: [{ message: { content: contents[index] ?? null } }],
          };
        },
      },
    },
  };
  return { client, calls: () => calls, requests };
}

function provider(client: OpenAICompatibleClient): OpenAIProvider {
  return new OpenAIProvider({ apiKey: "t", model: "gpt-5.6-terra", client });
}

describe("OpenAIProvider.extractClinicalRecord", () => {
  test("retries once when the first response is invalid, then validates", async () => {
    const fake = sequencedClient(["not json", JSON.stringify(validRecord)]);
    const record = await provider(fake.client).extractClinicalRecord([page]);
    expect(fake.calls()).toBe(2);
    expect(record.hospitalization.diagnoses).toEqual([]);
  });

  test("throws a typed error after two invalid responses without leaking clinical text", async () => {
    const sentinel = "PHI-SENTINEL-1234";
    const fake = sequencedClient([`${sentinel} not json`, sentinel]);
    const call = provider(fake.client).extractClinicalRecord([page]);
    await expect(call).rejects.toBeInstanceOf(LLMExtractionError);
    expect(fake.calls()).toBe(2);
    try {
      await call;
    } catch (error) {
      expect((error as Error).message).not.toContain(sentinel);
    }
  });

  test("requests low reasoning effort", async () => {
    const fake = sequencedClient([JSON.stringify(validRecord)]);
    await provider(fake.client).extractClinicalRecord([page]);
    expect(fake.requests[0]?.reasoning_effort).toBe("low");
  });
});

describe("OpenAIProvider request configuration", () => {
  test("merges extraBody into the request", async () => {
    const fake = sequencedClient([JSON.stringify(validRecord)]);
    const configured = new OpenAIProvider({
      apiKey: "t",
      model: "deepseek-flash",
      client: fake.client,
      extraBody: { thinking: { type: "disabled" } },
    });
    await configured.extractClinicalRecord([page]);
    expect(fake.requests[0]?.thinking).toEqual({ type: "disabled" });
  });

  test("omits reasoning effort when set to null", async () => {
    const fake = sequencedClient([JSON.stringify(validRecord)]);
    const configured = new OpenAIProvider({
      apiKey: "t",
      model: "qwen3.8-flash",
      client: fake.client,
      reasoningEffort: null,
    });
    await configured.extractClinicalRecord([page]);
    expect(Object.hasOwn(fake.requests[0] ?? {}, "reasoning_effort")).toBe(
      false,
    );
  });
});

describe("OpenAIProvider.analyzeClinicalRecord", () => {
  const record = validRecord as Parameters<
    OpenAIProvider["analyzeClinicalRecord"]
  >[0];

  test("retries once when the first findings response is invalid", async () => {
    const fake = sequencedClient([
      JSON.stringify({ findings: [] }),
      JSON.stringify([validFinding]),
    ]);
    const findings = await provider(fake.client).analyzeClinicalRecord(record);
    expect(fake.calls()).toBe(2);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.requiresHumanReview).toBe(true);
  });

  test("throws a typed error after two invalid findings responses", async () => {
    const fake = sequencedClient(["{}", "not json"]);
    const call = provider(fake.client).analyzeClinicalRecord(record);
    await expect(call).rejects.toBeInstanceOf(LLMExtractionError);
    expect(fake.calls()).toBe(2);
  });
});

async function collect(iterable: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of iterable) text += chunk;
  return text;
}

function streamingClient(chunks: string[]): {
  client: OpenAICompatibleClient;
  requests: Array<Record<string, unknown>>;
} {
  const requests: Array<Record<string, unknown>> = [];
  const client: OpenAICompatibleClient = {
    chat: {
      completions: {
        create: async (input) => {
          requests.push(input);
          return (async function* () {
            for (const chunk of chunks) {
              yield { choices: [{ delta: { content: chunk } }] };
            }
          })();
        },
      },
    },
  };
  return { client, requests };
}

describe("OpenAIProvider.answerClinicalQuestion", () => {
  const context = {
    documentId: "d1",
    record: validRecord,
    findings: [],
    pages: [{ pageNumber: 5, text: "Levofloxacina", score: 1 }],
    history: [],
    question: "¿Qué antibiótico recibió?",
  } as Parameters<OpenAIProvider["answerClinicalQuestion"]>[0];

  test("streams the answer chunks in order with stream: true", async () => {
    const fake = streamingClient(["Tomó ", "levofloxacina [p.5]."]);
    const text = await collect(
      provider(fake.client).answerClinicalQuestion(context),
    );
    expect(text).toBe("Tomó levofloxacina [p.5].");
    expect(fake.requests[0]?.stream).toBe(true);
  });
});

describe("OpenAIProvider.proposeTranscriptionEdit", () => {
  test("returns the parsed edit intent with a JSON response format", async () => {
    const fake = sequencedClient([
      JSON.stringify({
        kind: "edit",
        pageNumber: 3,
        incorrect: "Ansel",
        correct: "Ariel",
      }),
    ]);
    const intent = await provider(fake.client).proposeTranscriptionEdit({
      question: "en la pagina 3 donde dice Ansel es Ariel",
      history: [],
      pages: [{ pageNumber: 3, text: "Paciente Ansel", score: 1 }],
    });
    expect(intent).toEqual({
      kind: "edit",
      pageNumber: 3,
      incorrect: "Ansel",
      correct: "Ariel",
    });
    expect(fake.requests[0]?.response_format).toEqual({ type: "json_object" });
  });

  test("rejects short incorrect literals and retries", async () => {
    const fake = sequencedClient([
      JSON.stringify({ kind: "edit", incorrect: "a", correct: "b" }),
      JSON.stringify({ kind: "question" }),
    ]);
    const intent = await provider(fake.client).proposeTranscriptionEdit({
      question: "hola",
      history: [],
      pages: [],
    });
    expect(intent).toEqual({ kind: "question" });
    expect(fake.calls()).toBe(2);
  });
});

describe("OpenAIProvider summaries", () => {
  const record = validRecord as Parameters<
    OpenAIProvider["generateClinicalSummary"]
  >[0];

  test("returns the model clinical summary text", async () => {
    const fake = sequencedClient(["Resumen clínico en español."]);
    const summary = await provider(fake.client).generateClinicalSummary(record);
    expect(summary).toBe("Resumen clínico en español.");
  });

  test("returns the model audit summary text", async () => {
    const fake = sequencedClient(["Resumen de auditoría en español."]);
    const summary = await provider(fake.client).generateAuditSummary(
      record,
      [],
    );
    expect(summary).toBe("Resumen de auditoría en español.");
  });

  test("throws a typed error when a summary response is empty", async () => {
    const fake = sequencedClient([null]);
    const call = provider(fake.client).generateClinicalSummary(record);
    await expect(call).rejects.toBeInstanceOf(LLMExtractionError);
  });
});
