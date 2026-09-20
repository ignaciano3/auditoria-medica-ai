export const DOCUMENTS_TAG = "documents";

export const SETTINGS_TAG = "settings";

export function documentTag(documentId: string): string {
  return `document:${documentId}`;
}
