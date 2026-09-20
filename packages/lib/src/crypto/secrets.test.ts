import { describe, expect, test } from "bun:test";
import {
  decryptSecret,
  encryptSecret,
  parseEncryptionKey,
  requireEncryptionKey,
} from "./secrets.ts";

const KEY = Buffer.alloc(32, 7);

describe("parseEncryptionKey", () => {
  test("decodes a 32-byte base64 key", () => {
    const raw = Buffer.alloc(32, 1).toString("base64");
    expect(parseEncryptionKey(raw).length).toBe(32);
  });

  test("decodes a 64-char hex key", () => {
    expect(parseEncryptionKey("a".repeat(64)).length).toBe(32);
  });

  test("rejects a key of the wrong length", () => {
    expect(() => parseEncryptionKey("short")).toThrow();
  });
});

describe("requireEncryptionKey", () => {
  test("reads SETTINGS_ENCRYPTION_KEY from the source", () => {
    const raw = Buffer.alloc(32, 3).toString("base64");
    expect(requireEncryptionKey({ SETTINGS_ENCRYPTION_KEY: raw }).length).toBe(
      32,
    );
  });

  test("throws when the variable is missing", () => {
    expect(() => requireEncryptionKey({})).toThrow();
  });
});

describe("encryptSecret / decryptSecret", () => {
  test("round-trips a value", () => {
    const blob = encryptSecret("sk-secret", KEY);
    expect(blob.startsWith("v1:")).toBe(true);
    expect(decryptSecret(blob, KEY)).toBe("sk-secret");
  });

  test("produces a different ciphertext for the same plaintext", () => {
    expect(encryptSecret("x", KEY)).not.toBe(encryptSecret("x", KEY));
  });

  test("fails to decrypt with the wrong key", () => {
    const blob = encryptSecret("sk-secret", KEY);
    expect(() => decryptSecret(blob, Buffer.alloc(32, 9))).toThrow();
  });

  test("rejects a malformed blob", () => {
    expect(() => decryptSecret("not-a-blob", KEY)).toThrow();
    expect(() => decryptSecret("v2:a:b:c", KEY)).toThrow();
  });
});
