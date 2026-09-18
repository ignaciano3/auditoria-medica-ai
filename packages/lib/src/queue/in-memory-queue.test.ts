import { describe, expect, test } from "bun:test";
import { InMemoryQueue } from "./in-memory-queue.ts";
import type { QueueJob } from "./job-queue.ts";

describe("InMemoryQueue", () => {
  test("delivers a published document job to the handler", async () => {
    const queue = new InMemoryQueue();
    const seen: QueueJob[] = [];
    await queue.handle(async (job) => {
      seen.push(job);
    });
    await queue.publish({ kind: "process-document", documentId: "doc-1" });
    expect(seen).toEqual([{ kind: "process-document", documentId: "doc-1" }]);
  });

  test("delivers a published page transcription job to the handler", async () => {
    const queue = new InMemoryQueue();
    const seen: QueueJob[] = [];
    await queue.handle(async (job) => {
      seen.push(job);
    });
    await queue.publish({
      kind: "transcribe-page",
      documentId: "doc-1",
      pageNumber: 3,
    });
    expect(seen).toEqual([
      { kind: "transcribe-page", documentId: "doc-1", pageNumber: 3 },
    ]);
  });
});
