import { describe, expect, test } from "bun:test";
import { documents } from "./schema.ts";

describe("documents schema", () => {
  test("exposes expected columns", () => {
    const cols = Object.keys(documents);
    expect(cols).toContain("id");
    expect(cols).toContain("status");
    expect(cols).toContain("pageCount");
    expect(cols).toContain("userId");
  });
});
