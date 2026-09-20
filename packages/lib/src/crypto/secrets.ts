import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export function parseEncryptionKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("SETTINGS_ENCRYPTION_KEY is empty");
  }
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("SETTINGS_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}

export function requireEncryptionKey(
  source: Record<string, string | undefined> = process.env,
): Buffer {
  return parseEncryptionKey(source.SETTINGS_ENCRYPTION_KEY ?? "");
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(blob: string, key: Buffer): string {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Invalid encrypted secret format");
  }
  const ivPart = parts[1];
  const tagPart = parts[2];
  const cipherPart = parts[3];
  if (
    ivPart === undefined ||
    tagPart === undefined ||
    cipherPart === undefined
  ) {
    throw new Error("Invalid encrypted secret format");
  }
  const iv = Buffer.from(ivPart, "base64");
  const tag = Buffer.from(tagPart, "base64");
  if (tag.length !== TAG_BYTES) {
    throw new Error("Invalid encrypted secret tag");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(cipherPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
