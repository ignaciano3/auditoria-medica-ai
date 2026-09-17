import type { DocumentPage } from "@audit/domain";

export type ChunkPagesOptions = {
  maxPages?: number;
  maxChars?: number;
};

const DEFAULT_MAX_PAGES = 4;
const DEFAULT_MAX_CHARS = 24_000;

function normalizeCap(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return value > 0 ? value : 1;
}

function isEligible(page: DocumentPage): boolean {
  return (
    page.dataBearing === true &&
    (page.status === "text" || page.status === "vision")
  );
}

export function chunkPages(
  pages: DocumentPage[],
  options?: ChunkPagesOptions,
): DocumentPage[][] {
  const maxPages = normalizeCap(options?.maxPages, DEFAULT_MAX_PAGES);
  const maxChars = normalizeCap(options?.maxChars, DEFAULT_MAX_CHARS);
  const chunks: DocumentPage[][] = [];
  let current: DocumentPage[] = [];
  let currentChars = 0;

  for (const page of pages) {
    if (!isEligible(page)) continue;
    const wouldExceed =
      current.length > 0 &&
      (current.length + 1 > maxPages ||
        currentChars + page.text.length > maxChars);
    if (wouldExceed) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(page);
    currentChars += page.text.length;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}
