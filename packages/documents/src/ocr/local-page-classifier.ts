import type {
  PageClassification,
  PageClassifier,
  PageImage,
} from "./ocr-provider.ts";

const DATA_BEARING: PageClassification = {
  docType: "other",
  handwritten: false,
  dataBearing: true,
};

export class LocalPageClassifier implements PageClassifier {
  async classifyPage(_input: PageImage): Promise<PageClassification> {
    return DATA_BEARING;
  }
}
