import { describe, expect, test } from "bun:test";
import {
  isInProgress,
  pollIntervalMs,
  statusLabel,
  statusTone,
} from "./document-status.ts";

describe("status UI logic", () => {
  test("labels are Spanish", () => {
    expect(statusLabel("processing")).toBe("Procesando");
    expect(statusLabel("ready")).toBe("Listo");
  });
  test("terminal statuses stop polling", () => {
    expect(pollIntervalMs("ready")).toBeNull();
    expect(pollIntervalMs("processing")).toBe(2000);
  });
  test("maps each status to a badge tone", () => {
    expect(statusTone("ready")).toBe("success");
    expect(statusTone("error")).toBe("danger");
    expect(statusTone("uploaded")).toBe("neutral");
    expect(statusTone("processing")).toBe("brand");
  });
  test("only active processing is shown as in progress", () => {
    expect(isInProgress("processing")).toBe(true);
    expect(isInProgress("extracting")).toBe(true);
    expect(isInProgress("uploaded")).toBe(false);
    expect(isInProgress("ready")).toBe(false);
    expect(isInProgress("error")).toBe(false);
  });
});
