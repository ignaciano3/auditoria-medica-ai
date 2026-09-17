"use client";

import { errors, ui } from "@audit/lib/i18n";
import { type ChangeEvent, useRef, useState } from "react";
import { uploadDocument } from "../lib/actions.ts";

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function DocumentUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setState({ kind: "uploading" });
    const body = new FormData();
    body.append("file", file);
    try {
      const result = await uploadDocument(body);
      if (!result.ok) {
        setState({ kind: "error", message: result.error });
        return;
      }
      setState({ kind: "success" });
    } catch {
      setState({ kind: "error", message: errors.uploadFailed });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-foreground/20 p-4">
      <h2 className="text-base font-semibold">{ui.newDocument}</h2>
      <label className="inline-block w-fit cursor-pointer rounded-md bg-foreground px-4 py-2 text-background focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-foreground">
        {ui.upload}
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="application/pdf"
          disabled={state.kind === "uploading"}
          onChange={handleFileChange}
        />
      </label>
      {state.kind === "uploading" ? (
        <p className="text-foreground/60">{ui.uploading}</p>
      ) : null}
      {state.kind === "success" ? (
        <output className="text-[#1a7f37]">{ui.uploadSuccess}</output>
      ) : null}
      {state.kind === "error" ? (
        <p className="text-[#d1242f]" role="alert">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
