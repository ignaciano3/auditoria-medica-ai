import { describe, expect, test } from "bun:test";
import { parseChatBody } from "./route.ts";

describe("parseChatBody", () => {
  test("returns the trimmed message", () => {
    expect(parseChatBody({ message: "  hola  " })).toBe("hola");
  });
  test("rejects missing and empty messages", () => {
    expect(parseChatBody({})).toBeNull();
    expect(parseChatBody({ message: "   " })).toBeNull();
    expect(parseChatBody(null)).toBeNull();
  });
  test("rejects over-long messages", () => {
    expect(parseChatBody({ message: "x".repeat(2001) })).toBeNull();
  });
});
