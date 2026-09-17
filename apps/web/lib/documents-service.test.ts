import { describe, expect, test } from "bun:test";
import type { StorageProvider } from "@audit/lib";
import { errors, InMemoryQueue, InMemoryStorage } from "@audit/lib";
import {
  createUploadedDocument,
  type DocumentServiceDeps,
  deleteDocumentById,
  validateUpload,
} from "./documents-service.ts";

function pdfFile(name = "historia.pdf"): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

function makeDeps(): {
  deps: DocumentServiceDeps;
  storage: InMemoryStorage;
  removed: string[];
} {
  const storage = new InMemoryStorage();
  const removed: string[] = [];
  const deps: DocumentServiceDeps = {
    storage,
    queue: new InMemoryQueue(),
    documents: {
      async create(input) {
        return { id: input.id, status: "uploaded" as const };
      },
      async getById() {
        return { originalKey: "documents/known/original.pdf" };
      },
      async remove(id) {
        removed.push(id);
      },
    },
  };
  return { deps, storage, removed };
}

describe("validateUpload", () => {
  test("accepts a PDF", () => {
    expect(
      validateUpload({
        name: "historia.pdf",
        type: "application/pdf",
        size: 1024,
      }).ok,
    ).toBe(true);
  });

  test("rejects a non-PDF", () => {
    const result = validateUpload({
      name: "foto.png",
      type: "image/png",
      size: 1024,
    });
    expect(result).toEqual({ ok: false, error: errors.notPdf });
  });

  test("rejects oversized files", () => {
    expect(
      validateUpload({
        name: "grande.pdf",
        type: "application/pdf",
        size: 999_999_999,
      }).ok,
    ).toBe(false);
  });
});

describe("createUploadedDocument", () => {
  test("stores the PDF and returns the created document", async () => {
    const { deps, storage } = makeDeps();
    const result = await createUploadedDocument(deps, pdfFile());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("uploaded");
      const stored = await storage.get(`documents/${result.id}/original.pdf`);
      expect(stored).toBeInstanceOf(Uint8Array);
    }
  });

  test("cleans up and reports a storage failure", async () => {
    const { deps, removed } = makeDeps();
    const failing: DocumentServiceDeps = {
      ...deps,
      storage: {
        put: async () => {
          throw new Error("boom");
        },
        get: async () => new Uint8Array(),
        delete: async () => {},
      } satisfies StorageProvider,
    };
    const result = await createUploadedDocument(failing, pdfFile());
    expect(result).toEqual({
      ok: false,
      error: errors.uploadFailed,
      reason: "storage",
    });
    expect(removed).toHaveLength(1);
  });
});

describe("deleteDocumentById", () => {
  test("returns false when the document is missing", async () => {
    const { deps } = makeDeps();
    const missing: DocumentServiceDeps = {
      ...deps,
      documents: { ...deps.documents, getById: async () => null },
    };
    expect(await deleteDocumentById(missing, "nope")).toBe(false);
  });

  test("removes the row and the stored object", async () => {
    const { deps, removed } = makeDeps();
    expect(await deleteDocumentById(deps, "known")).toBe(true);
    expect(removed).toEqual(["known"]);
  });
});
