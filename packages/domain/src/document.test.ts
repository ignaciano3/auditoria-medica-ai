import { describe, expect, test } from "bun:test";
import { isTerminalStatus } from "./document.ts";

describe("isTerminalStatus", () => {
  test("ready and error are terminal", () => {
    expect(isTerminalStatus("ready")).toBe(true);
    expect(isTerminalStatus("error")).toBe(true);
  });
  test("processing is not terminal", () => {
    expect(isTerminalStatus("processing")).toBe(false);
  });
});
