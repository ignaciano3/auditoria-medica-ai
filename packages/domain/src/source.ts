export type TextBlock = {
  text: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
};

export type Source = {
  documentId: string;
  pageNumber: number;
  text: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
};

export type ExtractedValue<T> = {
  value: T;
  confidence?: number;
  sources: Source[];
};

export type Evidence = {
  source: Source;
  relevance: string;
};
