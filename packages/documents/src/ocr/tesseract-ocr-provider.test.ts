import { describe, expect, test } from "bun:test";
import {
  TesseractOCRProvider,
  type TesseractRecognize,
} from "./tesseract-ocr-provider.ts";

function fakeClassifier(result: {
  docType: "lab";
  handwritten: boolean;
  dataBearing: boolean;
}) {
  return {
    classifyPage: async () => result,
    transcribePage: async () => "unused",
  };
}

function fakeTesseract(text: string): TesseractRecognize {
  return async () => text;
}

const noRotation = async (png: Uint8Array) => png;

const page = { pageNumber: 1, png: new Uint8Array([1, 2]) };

describe("TesseractOCRProvider", () => {
  test("transcribes with the spa language", async () => {
    const calls: Array<{
      image: Uint8Array;
      options: Record<string, unknown>;
    }> = [];
    const recognize: TesseractRecognize = async (image, options) => {
      calls.push({ image: image as Uint8Array, options: options ?? {} });
      return "  Historia clínica   ";
    };
    const provider = new TesseractOCRProvider({
      classifier: fakeClassifier({
        docType: "lab",
        handwritten: false,
        dataBearing: true,
      }),
      recognize,
      orient: noRotation,
    });
    const result = await provider.transcribePage(page);
    expect(result).toBe("Historia clínica");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.image).toBe(page.png);
    expect(calls[0]?.options.lang).toBe("spa");
  });

  test("uses automatic page segmentation with orientation detection", async () => {
    const calls: Record<string, unknown>[] = [];
    const provider = new TesseractOCRProvider({
      classifier: fakeClassifier({
        docType: "lab",
        handwritten: false,
        dataBearing: true,
      }),
      recognize: async (_image, options) => {
        calls.push(options ?? {});
        return "text";
      },
      orient: noRotation,
    });
    await provider.transcribePage(page);
    expect(calls[0]?.psm).toBe(1);
  });

  test("allows overriding the page segmentation mode", async () => {
    const calls: Record<string, unknown>[] = [];
    const provider = new TesseractOCRProvider({
      classifier: fakeClassifier({
        docType: "lab",
        handwritten: false,
        dataBearing: true,
      }),
      recognize: async (_image, options) => {
        calls.push(options ?? {});
        return "text";
      },
      orient: noRotation,
      psm: 6,
    });
    await provider.transcribePage(page);
    expect(calls[0]?.psm).toBe(6);
  });

  test("delegates classification to the injected classifier", async () => {
    const classifier = fakeClassifier({
      docType: "lab",
      handwritten: false,
      dataBearing: true,
    });
    const provider = new TesseractOCRProvider({
      classifier,
      recognize: fakeTesseract("irrelevant"),
    });
    const result = await provider.classifyPage(page);
    expect(result).toEqual({
      docType: "lab",
      handwritten: false,
      dataBearing: true,
    });
  });

  test("falls back to an empty transcription when OCR returns no text", async () => {
    const provider = new TesseractOCRProvider({
      classifier: fakeClassifier({
        docType: "lab",
        handwritten: false,
        dataBearing: true,
      }),
      recognize: fakeTesseract("   "),
      orient: noRotation,
    });
    const result = await provider.transcribePage(page);
    expect(result).toBe("");
  });

  test("transcribes the oriented image", async () => {
    const oriented = new Uint8Array([9, 9]);
    const images: Uint8Array[] = [];
    const provider = new TesseractOCRProvider({
      classifier: fakeClassifier({
        docType: "lab",
        handwritten: false,
        dataBearing: true,
      }),
      orient: async () => oriented,
      recognize: async (image) => {
        images.push(image as Uint8Array);
        return "text";
      },
    });

    await provider.transcribePage(page);

    expect(images).toEqual([oriented]);
  });
});
