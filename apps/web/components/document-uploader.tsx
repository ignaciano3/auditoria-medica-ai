"use client";

import { errors, ui } from "@audit/lib/i18n";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
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
  const [isDragging, setIsDragging] = useState(false);
  const uploading = state.kind === "uploading";

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setState({ kind: "uploading" });
    let error: string | null = null;
    for (const file of files) {
      const body = new FormData();
      body.append("file", file);
      try {
        const result = await uploadDocument(body);
        if (!result.ok && error === null) error = result.error;
      } catch {
        if (error === null) error = errors.uploadFailed;
      }
    }
    setState(
      error === null ? { kind: "success" } : { kind: "error", message: error },
    );
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await uploadFiles(files);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!uploading) setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (uploading) return;
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-xs">
      <h2 className="text-base font-semibold">{ui.newDocument}</h2>
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors hover:border-brand/50 hover:bg-brand/5 focus-within:border-brand focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand ${
          isDragging ? "border-brand bg-brand/5" : "border-border bg-muted/40"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <UploadIcon className="size-6 text-muted-foreground" />
        <span className="font-medium">{ui.upload}</span>
        <span className="text-xs text-muted-foreground">{ui.dropHint}</span>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="application/pdf"
          disabled={uploading}
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
