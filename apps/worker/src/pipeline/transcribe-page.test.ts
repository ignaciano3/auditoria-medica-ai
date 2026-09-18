import { describe, expect, test } from "bun:test";
import type { OCRProvider } from "@audit/documents";
import type { DocumentPage, PageStatus } from "@audit/domain";
import {
  createTranscribePage,
  type TranscribePageDeps,
} from "./transcribe-page.ts";

const pageFixture: DocumentPage = {
  pageNumber: 1,
  text: "texto viejo",
  imageKey: "documents/d1/pages/1.png",
  docType: "evolution",
  handwritten: false,
  dataBearing: true,
  status: "vision",
};

type Marked = {
  documentId: string;
  pageNumber: number;
  status: PageStatus;
  text?: string;
};

function makeDeps(options: {
  page?: DocumentPage | null;
  getPage?: () => Promise<DocumentPage | null>;
  png?: Uint8Array;
  storageGet?: () => Promise<Uint8Array>;
  transcribePage?: (input: {
    pageNumber: number;
    png: Uint8Array;
  }) => Promise<string>;
  handwrittenTranscribePage?: () => Promise<string>;
}) {
  const marked: Marked[] = [];
  const infoEvents: Array<Record<string, unknown>> = [];
  const errorEvents: Array<Record<string, unknown>> = [];

  const ocr: OCRProvider = {
    classifyPage: () =>
      Promise.resolve({
        docType: "evolution",
        handwritten: false,
        dataBearing: true,
      }),
    transcribePage: options.transcribePage ?? (() => Promise.resolve("nuevo")),
  };

  const deps: TranscribePageDeps = {
    pages: {
      getPage:
        options.getPage ?? (() => Promise.resolve(options.page ?? pageFixture)),
      markStatus: (documentId, pageNumber, status, text) => {
        const entry: Marked = { documentId, pageNumber, status };
        if (text !== undefined) entry.text = text;
        marked.push(entry);
        return Promise.resolve();
      },
    },
    storage: {
      get:
        options.storageGet ??
        (() => Promise.resolve(options.png ?? new Uint8Array([1]))),
      put: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    },
    ocr,
    handwrittenOcr: options.handwrittenTranscribePage
      ? {
          classifyPage: ocr.classifyPage,
          transcribePage: options.handwrittenTranscribePage,
        }
      : undefined,
    logger: {
      info: (event) => {
        infoEvents.push(event);
      },
      error: (event) => {
        errorEvents.push(event);
      },
    },
  };

  return { deps, marked, infoEvents, errorEvents };
}

describe("createTranscribePage", () => {
  test("re-transcribes the stored image and updates the page text", async () => {
    const { deps, marked } = makeDeps({
      transcribePage: () => Promise.resolve("texto nuevo"),
    });

    await createTranscribePage(deps)({ documentId: "d1", pageNumber: 1 });

    expect(marked).toEqual([
      { documentId: "d1", pageNumber: 1, status: "pending" },
      {
        documentId: "d1",
        pageNumber: 1,
        status: "vision",
        text: "texto nuevo",
      },
    ]);
  });

  test("routes a handwritten page to the handwritten transcriber", async () => {
    const { deps, marked } = makeDeps({
      page: { ...pageFixture, handwritten: true },
      transcribePage: () => Promise.resolve("impreso"),
      handwrittenTranscribePage: () => Promise.resolve("manuscrito"),
    });

    await createTranscribePage(deps)({ documentId: "d1", pageNumber: 1 });

    expect(marked.at(-1)?.text).toBe("manuscrito");
  });

  test("uses the default OCR for handwritten pages without a handwritten transcriber", async () => {
    const { deps, marked } = makeDeps({
      page: { ...pageFixture, handwritten: true },
      transcribePage: () => Promise.resolve("por defecto"),
    });

    await createTranscribePage(deps)({ documentId: "d1", pageNumber: 1 });

    expect(marked.at(-1)?.text).toBe("por defecto");
  });

  test("marks the page as pending before transcribing and vision after", async () => {
    const { deps, marked } = makeDeps({
      transcribePage: () => Promise.resolve("texto nuevo"),
    });

    await createTranscribePage(deps)({ documentId: "d1", pageNumber: 1 });

    expect(marked.map((entry) => entry.status)).toEqual(["pending", "vision"]);
  });

  test("marks the page as failed and rethrows when transcription fails", async () => {
    const failure = new Error("ocr boom");
    const { deps, marked, errorEvents } = makeDeps({
      transcribePage: () => Promise.reject(failure),
    });

    await expect(
      createTranscribePage(deps)({ documentId: "d1", pageNumber: 1 }),
    ).rejects.toBe(failure);

    expect(marked).toEqual([
      { documentId: "d1", pageNumber: 1, status: "pending" },
      { documentId: "d1", pageNumber: 1, status: "failed" },
    ]);
    expect(errorEvents.some((event) => event.event === "page_failed")).toBe(
      true,
    );
  });

  test("throws when the page does not exist", async () => {
    const { deps, marked } = makeDeps({ getPage: () => Promise.resolve(null) });

    await expect(
      createTranscribePage(deps)({ documentId: "d1", pageNumber: 9 }),
    ).rejects.toThrow("Page not found");

    expect(marked).toHaveLength(0);
  });

  test("throws when the page has no stored image", async () => {
    const { deps, marked } = makeDeps({
      page: {
        pageNumber: 1,
        text: "",
        docType: "evolution",
        handwritten: false,
        dataBearing: true,
        status: "failed",
      },
    });

    await expect(
      createTranscribePage(deps)({ documentId: "d1", pageNumber: 1 }),
    ).rejects.toThrow("Page image not found");

    expect(marked).toHaveLength(0);
  });
});
