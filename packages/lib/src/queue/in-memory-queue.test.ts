import { describe, expect, test } from "bun:test";
import { InMemoryQueue } from "./in-memory-queue.ts";

describe("InMemoryQueue", () => {
  test("delivers a published job to the handler", async () => {
    const queue = new InMemoryQueue();
    const seen: string[] = [];
    await queue.handle(async (job) => {
      seen.push(job.documentId);
    });
    await queue.publish({ documentId: "doc-1" });
    expect(seen).toEqual(["doc-1"]);
  });
});
