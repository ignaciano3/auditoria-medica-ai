export const DOCUMENTS_TAG = "documents";

export function documentTag(documentId: string): string {
  return `document:${documentId}`;
}
