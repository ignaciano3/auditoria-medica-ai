"use client";

import { errors, ui } from "@audit/lib/i18n";
import { type ChangeEvent, useRef, useState } from "react";
import { uploadDocument } from "../lib/actions.ts";
import { SpinnerIcon, UploadIcon } from "./icons.tsx";
import { Callout } from "./ui/callout.tsx";

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
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-xs">
      <h2 className="text-base font-semibold">{ui.newDocument}</h2>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/40 px-6 py-8 text-center transition-colors hover:border-brand/50 hover:bg-brand/5 focus-within:border-brand focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
        <UploadIcon className="size-6 text-muted-foreground" />
        <span className="font-medium">{ui.upload}</span>
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
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <SpinnerIcon className="size-4" />
          {ui.uploading}
        </p>
      ) : null}
      {state.kind === "success" ? (
        <Callout tone="success" role="status">
          <p>{ui.uploadSuccess}</p>
        </Callout>
      ) : null}
      {state.kind === "error" ? (
        <Callout tone="danger" role="alert">
          <p>{state.message}</p>
        </Callout>
      ) : null}
    </section>
  );
}
