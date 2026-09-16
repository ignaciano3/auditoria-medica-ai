import type { DocumentPage } from "@audit/domain";
import type { OCRProvider, PageImage } from "../ocr/ocr-provider.ts";

export async function classifyPages(
  pages: PageImage[],
  provider: OCRProvider,
): Promise<DocumentPage[]> {
  const results: DocumentPage[] = [];
  for (const page of pages) {
    try {
      const classification = await provider.classifyPage(page);
      results.push({
        pageNumber: page.pageNumber,
        text: "",
        docType: classification.docType,
        handwritten: classification.handwritten,
        dataBearing: classification.dataBearing,
        status: "pending",
      });
    } catch {
      results.push({
        pageNumber: page.pageNumber,
        text: "",
        docType: "other",
        handwritten: false,
        dataBearing: true,
        status: "pending",
      });
    }
  }
  return results;
}
