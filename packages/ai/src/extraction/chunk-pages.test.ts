import { describe, expect, test } from "bun:test";
import type { DocumentPage, PageStatus } from "@audit/domain";
import { chunkPages } from "./chunk-pages.ts";

const page = (n: number, text: string): DocumentPage => ({
  pageNumber: n,
  text,
  docType: "evolution",
  handwritten: false,
  dataBearing: true,
  status: "vision",
});

const withStatus = (
  n: number,
  text: string,
  status: PageStatus,
): DocumentPage => ({
  ...page(n, text),
  status,
});

describe("chunkPages", () => {
  test("returns an empty array for empty input", () => {
    expect(chunkPages([])).toEqual([]);
  });

  test("skips non-data-bearing and non-text pages", () => {
    const pages = [
      page(1, "a"),
      { ...page(2, "b"), dataBearing: false },
      withStatus(3, "c", "skipped"),
    ];
    const chunks = chunkPages(pages);
    expect(chunks.flat().map((p) => p.pageNumber)).toEqual([1]);
  });

  test("keeps text pages as well as vision pages", () => {
    const pages = [withStatus(1, "a", "text"), page(2, "b")];
    const chunks = chunkPages(pages);
    expect(chunks.flat().map((p) => p.pageNumber)).toEqual([1, 2]);
  });

  test("respects the page cap", () => {
    const pages = [1, 2, 3, 4, 5].map((n) => page(n, "x"));
    const chunks = chunkPages(pages, { maxPages: 2 });
    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.length)).toEqual([2, 2, 1]);
  });

  test("defaults to a page cap of four", () => {
    const pages = [1, 2, 3, 4, 5, 6].map((n) => page(n, "x"));
    expect(chunkPages(pages).map((chunk) => chunk.length)).toEqual([4, 2]);
  });

  test("splits when the character budget would be exceeded", () => {
    const pages = ["12345", "12345", "12345"].map((text, i) =>
      page(i + 1, text),
    );
    const chunks = chunkPages(pages, { maxChars: 10 });
    expect(chunks.map((chunk) => chunk.map((p) => p.pageNumber))).toEqual([
      [1, 2],
      [3],
    ]);
  });

  test("keeps pages together when the character count equals the budget", () => {
    const pages = ["12345", "12345"].map((text, i) => page(i + 1, text));
    const chunks = chunkPages(pages, { maxChars: 10 });
    expect(chunks).toHaveLength(1);
  });

  test("keeps an oversized page as its own chunk", () => {
    const pages = [page(1, "x".repeat(24_001)), page(2, "y")];
    const chunks = chunkPages(pages);
    expect(chunks.map((chunk) => chunk.map((p) => p.pageNumber))).toEqual([
      [1],
      [2],
    ]);
  });

  test("treats non-positive caps as one", () => {
    const pages = [1, 2].map((n) => page(n, "x"));
    const chunks = chunkPages(pages, { maxPages: 0, maxChars: -5 });
    expect(chunks.map((chunk) => chunk.map((p) => p.pageNumber))).toEqual([
      [1],
      [2],
    ]);
  });
});
