import type { StorageProvider } from "./storage-provider.ts";

export class InMemoryStorage implements StorageProvider {
  private readonly store = new Map<string, Uint8Array>();

  async put(
    key: string,
    body: Uint8Array,
    _contentType: string,
  ): Promise<void> {
    this.store.set(key, body);
  }

  async get(key: string): Promise<Uint8Array> {
    const value = this.store.get(key);
    if (!value) throw new Error(`Object not found: ${key}`);
    return value;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
