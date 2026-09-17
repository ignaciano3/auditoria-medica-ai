import type {
  OCRProvider,
  PageClassification,
  PageClassifier,
  PageImage,
} from "./ocr-provider.ts";

export type TesseractRecognize = (
  image: Uint8Array | string,
  options?: Record<string, unknown>,
) => Promise<string>;

export const DEFAULT_TESSERACT_OPTIONS = {
  lang: "spa",
  psm: 1,
} as const;

export class TesseractOCRProvider implements OCRProvider {
  private readonly classifier: PageClassifier;
  private readonly recognize: TesseractRecognize;
  private readonly options: Record<string, unknown>;

  constructor(options: {
    classifier: PageClassifier;
    recognize?: TesseractRecognize;
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
    this.options = {
      lang: options.lang ?? DEFAULT_TESSERACT_OPTIONS.lang,
      psm: options.psm ?? DEFAULT_TESSERACT_OPTIONS.psm,
    };
  }

  async classifyPage(input: PageImage): Promise<PageClassification> {
    return this.classifier.classifyPage(input);
  }

  async transcribePage(input: PageImage): Promise<string> {
    return (await this.recognize(input.png, this.options)).trim();
  }
}
