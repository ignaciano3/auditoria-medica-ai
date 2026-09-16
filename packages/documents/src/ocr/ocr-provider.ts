import type { PageDocType } from "@audit/domain";

export type PageImage = { pageNumber: number; png: Uint8Array };

export type PageClassification = {
  docType: PageDocType;
  handwritten: boolean;
  dataBearing: boolean;
};

export interface OCRProvider {
  classifyPage(input: PageImage): Promise<PageClassification>;
  transcribePage(input: PageImage): Promise<string>;
}
