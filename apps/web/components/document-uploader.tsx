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
    <section className="card">
      <h2 className="card-title">{ui.newDocument}</h2>
      <label className="upload-button">
        {ui.upload}
        <input
          ref={inputRef}
          className="upload-input"
          type="file"
          accept="application/pdf"
          disabled={state.kind === "uploading"}
          onChange={handleFileChange}
        />
      </label>
      {state.kind === "uploading" ? (
        <p className="muted">{ui.uploading}</p>
      ) : null}
      {state.kind === "success" ? (
        <output className="success">{ui.uploadSuccess}</output>
      ) : null}
      {state.kind === "error" ? (
        <p className="error" role="alert">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
