import { describe, expect, test } from "bun:test";
import * as mupdf from "mupdf";
import {
  detectOrientation,
  orientPng,
  parseOsd,
  rotatePng,
  scoreText,
} from "./orientation.ts";
import type { TesseractRecognize } from "./tesseract-ocr-provider.ts";

function pngDimensions(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function fixturePng(width: number, height: number): Uint8Array {
  const pixmap = new mupdf.Pixmap(
    mupdf.ColorSpace.DeviceRGB,
    [0, 0, width, height],
    false,
  );
  try {
    return new Uint8Array(pixmap.asPNG());
  } finally {
    pixmap.destroy();
  }
}

const OSD_OUTPUT = `Page number: 0
Orientation in degrees: 90
Rotate: 270
Orientation confidence: 3.49
Script: Latin
Script confidence: 1.48`;

describe("parseOsd", () => {
  test("reads the rotation and script confidence", () => {
    expect(parseOsd(OSD_OUTPUT)).toEqual({
      orientation: 270,
      confidence: 3.49,
      scriptConfidence: 1.48,
    });
  });

  test("derives the rotation when Rotate is absent", () => {
    expect(
      parseOsd("Orientation in degrees: 90\nOrientation confidence: 2"),
    ).toEqual({ orientation: 270, confidence: 2, scriptConfidence: 0 });
  });

  test("returns null when no orientation is reported", () => {
    expect(
      parseOsd("Estimated resolution of descreen is not within range"),
    ).toBe(null);
  });
});

describe("scoreText", () => {
  test("prefers Spanish clinical text over gibberish", () => {
    expect(
      scoreText("Paciente: evolución clínica, fecha de ingreso"),
    ).toBeGreaterThan(scoreText("vnnoieivin jotias aay qwrt"));
  });
});

describe("detectOrientation", () => {
  test("picks the OSD candidate when it scores best", async () => {
    const osd =
      "Rotate: 180\nOrientation confidence: 2.5\nScript: Latin\nScript confidence: 1.2";
    const recognize: TesseractRecognize = async (image, options) => {
      if (options?.psm === 0) return osd;
      const degrees = (image as Uint8Array)[0] ?? 0;
      return degrees === 180
        ? "paciente evolución clínica fecha de ingreso"
        : "vnnoieivin jotias aay qwrt";
    };

    const result = await detectOrientation(
      new Uint8Array([7, 7, 7]),
      recognize,
      { rotate: (_png, degrees) => new Uint8Array([degrees]) },
    );

    expect(result).toBe(180);
  });

  test("corrects a confident OSD that is 180 degrees off using the text score", async () => {
    const osd =
      "Orientation in degrees: 90\nRotate: 270\nOrientation confidence: 2.61\nScript: Korean\nScript confidence: 0.11";
    const recognize: TesseractRecognize = async (image, options) => {
      if (options?.psm === 0) return osd;
      const degrees = (image as Uint8Array)[0] ?? 0;
      if (degrees === 90) {
        return "Paciente: evolución clínica, fecha de ingreso, enfermería";
      }
      return "vnnoieivin jotias aay qwrt";
    };

    const result = await detectOrientation(
      new Uint8Array([1, 2, 3]),
      recognize,
      { rotate: (_png, degrees) => new Uint8Array([degrees]) },
    );

    expect(result).toBe(90);
  });

  test("scores every rotation when OSD is unavailable", async () => {
    const recognize: TesseractRecognize = async (image, options) => {
      if (options?.psm === 0) return "not osd output";
      const degrees = (image as Uint8Array)[0] ?? 0;
      if (degrees === 180) {
        return "Paciente: fecha de ingreso, cuidados intensivos";
      }
      return "vnnoieivin jotias";
    };

    const result = await detectOrientation(
      new Uint8Array([1, 2, 3]),
      recognize,
      { rotate: (_png, degrees) => new Uint8Array([degrees]) },
    );

    expect(result).toBe(180);
  });

  test("keeps the OSD reading when no rotation reads better", async () => {
    const result = await detectOrientation(
      new Uint8Array([1, 2, 3]),
      async () => "Rotate: 90\nOrientation confidence: 0.5",
      { rotate: (_png, degrees) => new Uint8Array([degrees]) },
    );

    expect(result).toBe(90);
  });

  test("does not fail when the image cannot be rotated", async () => {
    const result = await detectOrientation(
      new Uint8Array([1, 2, 3]),
      async () => "not osd output",
      {
        rotate: () => {
          throw new Error("cannot decode");
        },
      },
    );

    expect(result).toBe(0);
  });
});

describe("rotatePng", () => {
  test("swaps the dimensions of a quarter turn", () => {
    const png = fixturePng(2, 1);
    const rotated = rotatePng(png, 90);

    expect(pngDimensions(rotated)).toEqual({ width: 1, height: 2 });
  });

  test("keeps the dimensions of a half turn", () => {
    const png = fixturePng(2, 1);
    const rotated = rotatePng(png, 180);

    expect(pngDimensions(rotated)).toEqual({ width: 2, height: 1 });
  });
});

describe("orientPng", () => {
  test("returns the image rotated by the detected orientation", async () => {
    const osd =
      "Rotate: 90\nOrientation confidence: 3\nScript: Latin\nScript confidence: 1";
    const recognize: TesseractRecognize = async (image, options) => {
      if (options?.psm === 0) return osd;
      const degrees = (image as Uint8Array)[0] ?? 0;
      return degrees === 90
        ? "paciente evolución clínica"
        : "vnnoieivin jotias";
    };

    const result = await orientPng(new Uint8Array([1, 2, 3]), recognize, {
      rotate: (_png, degrees) => new Uint8Array([degrees]),
    });

    expect(Array.from(result)).toEqual([90]);
  });
});
