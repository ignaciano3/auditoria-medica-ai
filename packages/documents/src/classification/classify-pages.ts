import type { DocumentPage } from "@audit/domain";
import type {
  OCRProvider,
  PageClassification,
  PageImage,
} from "../ocr/ocr-provider.ts";

export type ClassifyPagesHooks = {
  onPageClassified?(
    pageNumber: number,
    classification: PageClassification,
  ): void;
  onPageError?(pageNumber: number, error: unknown): void;
};

export async function classifyPage(
  page: PageImage,
  provider: OCRProvider,
  hooks: ClassifyPagesHooks = {},
): Promise<DocumentPage> {
  try {
    const classification = await provider.classifyPage(page);
    hooks.onPageClassified?.(page.pageNumber, classification);
    return {
      pageNumber: page.pageNumber,
      text: "",
      docType: classification.docType,
      handwritten: classification.handwritten,
      dataBearing: classification.dataBearing,
      status: "pending",
    };
  } catch (error) {
    hooks.onPageError?.(page.pageNumber, error);
    return {
      pageNumber: page.pageNumber,
      text: "",
      docType: "other",
      handwritten: false,
      dataBearing: true,
      status: "pending",
    };
  }
}

export async function classifyPages(
  pages: PageImage[],
  provider: OCRProvider,
  hooks: ClassifyPagesHooks = {},
): Promise<DocumentPage[]> {
  const results: DocumentPage[] = [];
  for (const page of pages) {
    results.push(await classifyPage(page, provider, hooks));
  }
  return results;
}
