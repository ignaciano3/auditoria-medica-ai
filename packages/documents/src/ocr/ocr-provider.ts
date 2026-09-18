import type { PageDocType } from "@audit/domain";

export const OCR_LANGUAGE = "spa";

export type PageImage = { pageNumber: number; png: Uint8Array };

export type PageClassification = {
  docType: PageDocType;
  handwritten: boolean;
  dataBearing: boolean;
};

export interface PageClassifier {
  classifyPage(input: PageImage): Promise<PageClassification>;
}

export interface OCRProvider extends PageClassifier {
  transcribePage(input: PageImage): Promise<string>;
}
