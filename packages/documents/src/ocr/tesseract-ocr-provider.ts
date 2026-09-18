import type {
  OCRProvider,
  PageClassification,
  PageClassifier,
  PageImage,
} from "./ocr-provider.ts";
import { OCR_LANGUAGE } from "./ocr-provider.ts";
import { orientPng } from "./orientation.ts";

export type TesseractRecognize = (
  image: Uint8Array | string,
  options?: Record<string, unknown>,
) => Promise<string>;

export const DEFAULT_TESSERACT_OPTIONS = {
  lang: OCR_LANGUAGE,
  psm: 1,
} as const;

export class TesseractOCRProvider implements OCRProvider {
  private readonly classifier: PageClassifier;
  private readonly recognize: TesseractRecognize;
  private readonly orient: (png: Uint8Array) => Promise<Uint8Array>;
  private readonly options: Record<string, unknown>;

  constructor(options: {
    classifier: PageClassifier;
    recognize?: TesseractRecognize;
    orient?: (png: Uint8Array) => Promise<Uint8Array>;
    lang?: string;
    psm?: number;
  }) {
    this.classifier = options.classifier;
    this.recognize =
      options.recognize ??
      (async (image, ocrOptions) => {
        const { recognize } = await import("node-tesseract-ocr");
        return recognize(image as Parameters<typeof recognize>[0], ocrOptions);
      });
    this.orient = options.orient ?? ((png) => orientPng(png, this.recognize));
    this.options = {
      lang: options.lang ?? DEFAULT_TESSERACT_OPTIONS.lang,
      psm: options.psm ?? DEFAULT_TESSERACT_OPTIONS.psm,
    };
  }

  async classifyPage(input: PageImage): Promise<PageClassification> {
    return this.classifier.classifyPage(input);
  }

  async transcribePage(input: PageImage): Promise<string> {
    const oriented = await this.orient(input.png);
    return (await this.recognize(oriented, this.options)).trim();
  }
}
