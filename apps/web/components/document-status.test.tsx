import { describe, expect, test } from "bun:test";
import {
  pollIntervalMs,
  statusBadgeClass,
  statusLabel,
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
  test("ready and error badges override the default", () => {
    expect(statusBadgeClass("ready")).toContain("bg-[#1a7f37]");
    expect(statusBadgeClass("error")).toContain("bg-[#d1242f]");
    expect(statusBadgeClass("processing")).toBe("");
  });
});
