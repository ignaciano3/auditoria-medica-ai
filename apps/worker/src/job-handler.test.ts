import { describe, expect, test } from "bun:test";
import type { ProviderSettings } from "@audit/domain";
import type { QueueJob } from "@audit/lib";
import { errors } from "@audit/lib";
import { createJobHandler, type JobHandlerDeps } from "./job-handler.ts";

function makeSettings(): ProviderSettings {
  return {
    llmProvider: "opencode",
    llmModel: "deepseek-v4.1-flash",
    ocrProvider: "opencode",
    ocrModel: "deepseek-v4-flash-vision-exp",
    keys: { openai: "", deepseek: "", qwen: "", opencode: "sk-test" },
  };
}

type LogEvent = Record<string, unknown>;

function makeDeps(overrides: Partial<JobHandlerDeps> = {}): {
  deps: JobHandlerDeps;
  logs: LogEvent[];
  statuses: {
    id: string;
    status: string;
    error?: string | null | undefined;
  }[];
  dispatched: QueueJob[];
} {
  const logs: LogEvent[] = [];
  const statuses: {
    id: string;
    status: string;
    error?: string | null | undefined;
  }[] = [];
  const dispatched: QueueJob[] = [];
  const deps: JobHandlerDeps = {
    documents: {
      async updateStatus(id, status, error) {
        statuses.push({ id, status, error });
      },
    },
    loadSettings: async () => makeSettings(),
    createProvider: () => ({}) as never,
    createOcr: () => ({ ocr: {} as never }),
    dispatch: async (job) => {
      dispatched.push(job);
    },
    logger: {
      info: (event) => logs.push(event),
      error: (event) => logs.push(event),
    },
    ...overrides,
  };
  return { deps, logs, statuses, dispatched };
}

const processJob: QueueJob = {
  kind: "process-document",
  documentId: "d1",
};

describe("createJobHandler", () => {
  test("marks the document as error when settings loading fails", async () => {
    const { deps, logs, statuses, dispatched } = makeDeps({
      loadSettings: async () => {
        throw new Error("Failed to decrypt a stored key");
      },
    });

    await expect(createJobHandler(deps)(processJob)).rejects.toThrow(
      "Failed to decrypt a stored key",
    );
    expect(dispatched).toEqual([]);
    expect(statuses).toEqual([
      { id: "d1", status: "error", error: errors.processingFailed },
    ]);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "job_setup_failed",
          kind: "process-document",
          documentId: "d1",
          message: "Failed to decrypt a stored key",
        }),
      ]),
    );
  });

  test("does not mark the document as error for transcribe-page setup failures", async () => {
    const { deps, statuses } = makeDeps({
      loadSettings: async () => {
        throw new Error("boom");
      },
    });

    await expect(
      createJobHandler(deps)({
        kind: "transcribe-page",
        documentId: "d1",
        pageNumber: 1,
      }),
    ).rejects.toThrow("boom");
    expect(statuses).toEqual([]);
  });

  test("dispatches with the runtime built from settings", async () => {
    const provider = { name: "provider" };
    const ocr = { name: "ocr" };
    const { deps, statuses, dispatched } = makeDeps({
      createProvider: () => provider as never,
      createOcr: () => ({ ocr: ocr as never, handwrittenOcr: ocr as never }),
    });

    await createJobHandler(deps)(processJob);

    expect(dispatched).toEqual([processJob]);
    expect(statuses).toEqual([]);
  });

  test("propagates dispatch failures without overwriting the status", async () => {
    const { deps, statuses } = makeDeps({
      dispatch: async () => {
        throw new Error("pipeline failed");
      },
    });

    await expect(createJobHandler(deps)(processJob)).rejects.toThrow(
      "pipeline failed",
    );
    expect(statuses).toEqual([]);
  });
});
