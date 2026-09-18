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

const originalKey = "documents/known/original.pdf";
const imageKeys = [
  "documents/known/pages/1.png",
  "documents/known/pages/2.png",
];

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
        return { originalKey };
      },
      async remove(id) {
        removed.push(id);
      },
    },
    pages: {
      async listImageKeys() {
        return imageKeys;
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
  test("reports not found when the document is missing", async () => {
    const { deps } = makeDeps();
    const missing: DocumentServiceDeps = {
      ...deps,
      documents: { ...deps.documents, getById: async () => null },
    };
    expect(await deleteDocumentById(missing, "nope")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  test("removes the row, the original and every page image", async () => {
    const { deps, storage, removed } = makeDeps();
    await storage.put(originalKey, new Uint8Array([1]), "application/pdf");
    for (const key of imageKeys) {
      await storage.put(key, new Uint8Array([2]), "image/png");
    }

    expect(await deleteDocumentById(deps, "known")).toEqual({ ok: true });
    expect(removed).toEqual(["known"]);
    await expect(storage.get(originalKey)).rejects.toThrow();
    for (const key of imageKeys) {
      await expect(storage.get(key)).rejects.toThrow();
    }
  });

  test("keeps the record when deleting objects from storage fails", async () => {
    const { deps, removed } = makeDeps();
    const failing: DocumentServiceDeps = {
      ...deps,
      storage: {
        put: async () => {},
        get: async () => new Uint8Array(),
        delete: async () => {
          throw new Error("boom");
        },
      } satisfies StorageProvider,
    };

    expect(await deleteDocumentById(failing, "known")).toEqual({
      ok: false,
      reason: "storage",
    });
    expect(removed).toHaveLength(0);
  });
});
