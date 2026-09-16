import { describe, expect, test } from "bun:test";
import type { PageClassification, PageImage } from "@audit/documents";
import type { DocumentPage, DocumentStatus } from "@audit/domain";
import { errors, processing } from "@audit/lib";
import { createProcessDocument } from "./process-document.ts";

type Update = { status: DocumentStatus; error: string | null };

const evolution: PageClassification = {
  docType: "evolution",
  handwritten: false,
  dataBearing: true,
};

function makeDeps(options: {
  render?: () => Promise<
    Array<{
      pageNumber: number;
      png: Uint8Array;
      width: number;
      height: number;
    }>
  >;
  storageGet?: () => Promise<Uint8Array>;
  classifyPage?: (input: PageImage) => Promise<PageClassification>;
  transcribePage?: (input: PageImage) => Promise<string>;
}) {
  const updates: Update[] = [];
  const saved: DocumentPage[][] = [];
  const storedKeys: string[] = [];
  const pageCounts: number[] = [];
  const infoEvents: Array<Record<string, unknown>> = [];
  const errorEvents: Array<Record<string, unknown>> = [];

  const processDocument = createProcessDocument({
    documents: {
      getById: () =>
        Promise.resolve({
          id: "d1",
          originalKey: "documents/d1/original.pdf",
        }),
      updateStatus: (_id, status, error) => {
        updates.push({ status, error: error ?? null });
        return Promise.resolve();
      },
      setPageCount: (_id, pageCount) => {
        pageCounts.push(pageCount);
        return Promise.resolve();
      },
    },
    pages: {
      replaceForDocument: (_id, pages) => {
        saved.push(pages);
        return Promise.resolve();
      },
    },
    storage: {
      get: options.storageGet ?? (() => Promise.resolve(new Uint8Array([1]))),
      put: (key) => {
        storedKeys.push(key);
        return Promise.resolve();
      },
      delete: () => Promise.resolve(),
    },
    render:
      options.render ??
      (() =>
        Promise.resolve([
          { pageNumber: 1, png: new Uint8Array([1]), width: 10, height: 10 },
          { pageNumber: 2, png: new Uint8Array([2]), width: 10, height: 10 },
        ])),
    ocr: {
      classifyPage: options.classifyPage ?? (() => Promise.resolve(evolution)),
      transcribePage:
        options.transcribePage ?? (() => Promise.resolve("texto")),
    },
    logger: {
      info: (event) => {
        infoEvents.push(event);
      },
      error: (event) => {
        errorEvents.push(event);
      },
    },
  });

  return {
    processDocument,
    updates,
    saved,
    storedKeys,
    pageCounts,
    infoEvents,
    errorEvents,
  };
}

describe("createProcessDocument", () => {
  test("renders, classifies, transcribes, and marks the document ready", async () => {
    const deps = makeDeps({
      classifyPage: ({ pageNumber }) =>
        Promise.resolve(
          pageNumber === 2
            ? { docType: "flowsheet", handwritten: true, dataBearing: false }
            : evolution,
        ),
    });

    await deps.processDocument({ documentId: "d1" });

    const statuses = deps.updates.map((update) => update.status);
    expect(statuses).toEqual(["processing", "extracting", "ready"]);
    expect(deps.pageCounts).toEqual([2]);
    expect(deps.saved).toHaveLength(1);

    expect(deps.storedKeys).toEqual([
      "documents/d1/pages/1.png",
      "documents/d1/pages/2.png",
    ]);

    const pages = deps.saved[0] ?? [];
    expect(pages).toHaveLength(2);

    expect(pages[0]).toMatchObject({
      pageNumber: 1,
      status: "vision",
      text: "texto",
      imageKey: "documents/d1/pages/1.png",
    });

    expect(pages[1]).toMatchObject({
      pageNumber: 2,
      status: "skipped",
      skipReason: processing.flowsheetSkipped,
      imageKey: "documents/d1/pages/2.png",
    });
  });

  test("skips non-data-bearing pages with a reason", async () => {
    const deps = makeDeps({
      classifyPage: () =>
        Promise.resolve({
          docType: "other",
          handwritten: false,
          dataBearing: false,
        }),
    });

    await deps.processDocument({ documentId: "d1" });

    const pages = deps.saved[0] ?? [];
    expect(pages[0]?.status).toBe("skipped");
    expect(pages[0]?.skipReason).toBe(processing.notDataBearing);
    expect(pages[1]?.status).toBe("skipped");
  });

  test("marks a failed page and keeps processing the rest", async () => {
    const deps = makeDeps({
      transcribePage: ({ pageNumber }) =>
        pageNumber === 1
          ? Promise.reject(new Error("ocr down"))
          : Promise.resolve("texto"),
    });

    await deps.processDocument({ documentId: "d1" });

    const pages = deps.saved[0] ?? [];
    expect(pages[0]?.status).toBe("failed");
    expect(pages[0]?.imageKey).toBe("documents/d1/pages/1.png");
    expect(pages[1]?.status).toBe("vision");
    expect(deps.updates.at(-1)?.status).toBe("ready");
  });

  test("marks the document as error and rethrows when rendering fails", async () => {
    const failure = new Error("render boom");
    const deps = makeDeps({
      render: () => Promise.reject(failure),
    });

    await expect(deps.processDocument({ documentId: "d1" })).rejects.toBe(
      failure,
    );

    const last = deps.updates.at(-1);
    expect(last?.status).toBe("error");
    expect(last?.error).toBe(errors.processingFailed);
    expect(deps.saved).toHaveLength(0);
  });

  test("marks the document as error and rethrows when download fails", async () => {
    const failure = new Error("storage boom");
    const deps = makeDeps({
      storageGet: () => Promise.reject(failure),
    });

    await expect(deps.processDocument({ documentId: "d1" })).rejects.toBe(
      failure,
    );

    const last = deps.updates.at(-1);
    expect(last?.status).toBe("error");
    expect(last?.error).toBe(errors.processingFailed);
    expect(deps.saved).toHaveLength(0);
  });
});
