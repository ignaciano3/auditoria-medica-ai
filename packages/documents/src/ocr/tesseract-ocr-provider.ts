import type {
  OCRProvider,
  PageClassification,
  PageImage,
} from "./ocr-provider.ts";

export type TesseractRecognize = (
  image: Uint8Array | string,
  options?: Record<string, unknown>,
) => Promise<string>;

export class TesseractOCRProvider implements OCRProvider {
  private readonly classifier: OCRProvider;
  private readonly recognize: TesseractRecognize;
  private readonly lang: string;

  constructor(options: {
    classifier: OCRProvider;
    recognize?: TesseractRecognize;
    lang?: string;
  }) {
    this.classifier = options.classifier;
    this.recognize =
      options.recognize ??
      (async (image, ocrOptions) => {
        const { recognize } = await import("node-tesseract-ocr");
        return recognize(image as Parameters<typeof recognize>[0], ocrOptions);
      });
    this.lang = options.lang ?? "spa";
  }

  async classifyPage(input: PageImage): Promise<PageClassification> {
    return this.classifier.classifyPage(input);
  }

  async transcribePage(input: PageImage): Promise<string> {
    return (await this.recognize(input.png, { lang: this.lang })).trim();
  }
}
