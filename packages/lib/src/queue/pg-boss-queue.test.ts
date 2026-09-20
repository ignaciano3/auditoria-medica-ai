import { describe, expect, test } from "bun:test";
import {
  PROCESS_DOCUMENT_EXPIRE_SECONDS,
  sendOptionsFor,
} from "./pg-boss-queue.ts";

describe("sendOptionsFor", () => {
  test("gives document processing a long expiry so a slow OCR run is not retried mid-flight", () => {
    expect(
      sendOptionsFor({ kind: "process-document", documentId: "d1" }),
    ).toEqual({ expireInSeconds: PROCESS_DOCUMENT_EXPIRE_SECONDS });
    expect(PROCESS_DOCUMENT_EXPIRE_SECONDS).toBeGreaterThan(900);
  });

  test("leaves short jobs on the queue default expiry", () => {
    expect(
      sendOptionsFor({
        kind: "transcribe-page",
        documentId: "d1",
        pageNumber: 1,
      }),
    ).toBeUndefined();
    expect(
      sendOptionsFor({ kind: "extract-document", documentId: "d1" }),
    ).toBeUndefined();
  });
});
