import { describe, expect, test } from "bun:test";
import { InMemoryStorage } from "./in-memory-storage.ts";

describe("InMemoryStorage", () => {
  test("round-trips bytes and deletes", async () => {
    const storage = new InMemoryStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    await storage.put("k/1.bin", bytes, "application/octet-stream");
    expect(await storage.get("k/1.bin")).toEqual(bytes);
    await storage.delete("k/1.bin");
    await expect(storage.get("k/1.bin")).rejects.toThrow();
  });
});
