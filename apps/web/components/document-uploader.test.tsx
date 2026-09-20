/// <reference lib="dom" />

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { errors, ui } from "@audit/lib/i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

type UploadResult = { ok: true } | { ok: false; error: string };

let uploaded: File[] = [];
let results: UploadResult[] = [];

mock.module("../lib/actions.ts", () => ({
  uploadDocument: async (formData: FormData) => {
    const file = formData.get("file") as File;
    uploaded.push(file);
    return results.shift() ?? { ok: true };
  },
}));

const { DocumentUploader } = await import("./document-uploader.tsx");

function pdf(name: string): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

function renderUploader() {
  const { container } = render(<DocumentUploader />);
  const zone = container.querySelector("label");
  if (!zone) throw new Error("dropzone not found");
  return zone;
}

function drop(zone: Element, files: File[]) {
  fireEvent.drop(zone, { dataTransfer: { files } });
}

beforeEach(() => {
  uploaded = [];
  results = [];
});

describe("DocumentUploader drag and drop", () => {
  test("uploads a file dropped on the dropzone", async () => {
    const zone = renderUploader();
    drop(zone, [pdf("historia.pdf")]);

    await waitFor(() => expect(uploaded).toHaveLength(1));
    expect(uploaded[0]?.name).toBe("historia.pdf");
    expect((await screen.findByText(ui.uploadSuccess)).textContent).toBe(
      ui.uploadSuccess,
    );
  });

  test("uploads every dropped file in sequence", async () => {
    const zone = renderUploader();
    drop(zone, [pdf("uno.pdf"), pdf("dos.pdf")]);

    await waitFor(() => expect(uploaded).toHaveLength(2));
    expect(uploaded.map((file) => file.name)).toEqual(["uno.pdf", "dos.pdf"]);
  });

  test("shows the action error when a dropped file is rejected", async () => {
    results = [{ ok: false, error: errors.notPdf }];
    const zone = renderUploader();
    drop(zone, [pdf("nota.txt")]);

    await waitFor(() =>
      expect(screen.getByText(errors.notPdf).textContent).toBe(errors.notPdf),
    );
  });
});
