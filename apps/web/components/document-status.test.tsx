import { describe, expect, test } from "bun:test";
import { pollIntervalMs, statusLabel } from "./document-status.ts";

describe("status UI logic", () => {
  test("labels are Spanish", () => {
    expect(statusLabel("processing")).toBe("Procesando");
    expect(statusLabel("ready")).toBe("Listo");
  });
  test("terminal statuses stop polling", () => {
    expect(pollIntervalMs("ready")).toBeNull();
    expect(pollIntervalMs("processing")).toBe(2000);
  });
});
