import type { DocumentPage } from "@audit/domain";

export type RetrievedPage = {
  pageNumber: number;
  text: string;
  score: number;
};

export type RetrieveOptions = { maxPages?: number };

const K1 = 1.2;
const B = 0.75;
const DEFAULT_MAX_PAGES = 6;

const STOPWORDS = new Set([
  "de",
  "la",
  "el",
  "que",
  "y",
  "en",
  "un",
  "una",
  "los",
  "las",
  "del",
  "al",
  "se",
  "con",
  "por",
  "para",
  "su",
  "sus",
  "es",
  "son",
  "fue",
  "como",
  "mas",
  "no",
  "lo",
  "le",
  "les",
  "o",
  "a",
  "e",
  "the",
  "of",
  "to",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

export function retrievePages(
  pages: DocumentPage[],
  question: string,
  options: RetrieveOptions = {},
): RetrievedPage[] {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const corpus = pages.filter(
    (pageItem) =>
      pageItem.text.trim().length > 0 &&
      pageItem.status !== "failed" &&
      pageItem.status !== "skipped",
  );
  if (corpus.length === 0) return [];

  const queryTokens = tokenize(question);
  if (queryTokens.length === 0) return [];

  const documentTokens = corpus.map((pageItem) => tokenize(pageItem.text));
  const averageLength =
    documentTokens.reduce((sum, tokens) => sum + tokens.length, 0) /
    corpus.length;

  const documentFrequency = new Map<string, number>();
  for (const tokens of documentTokens) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const scored = corpus.map((pageItem, index) => {
    const tokens = documentTokens[index] ?? [];
    const termFrequency = new Map<string, number>();
    for (const term of tokens) {
      termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
    }
    let score = 0;
    for (const term of queryTokens) {
      const frequency = termFrequency.get(term) ?? 0;
      if (frequency === 0) continue;
      const n = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (corpus.length - n + 0.5) / (n + 0.5));
      const denominator =
        frequency + K1 * (1 - B + (B * tokens.length) / averageLength);
      score += idf * ((frequency * (K1 + 1)) / denominator);
    }
    return { pageNumber: pageItem.pageNumber, text: pageItem.text, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber)
    .slice(0, maxPages);
}
