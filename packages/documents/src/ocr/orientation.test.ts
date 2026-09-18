import { describe, expect, test } from "bun:test";
import * as mupdf from "mupdf";
import {
  detectOrientation,
  orientPng,
  parseOsd,
  rotatePng,
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
  test("reads the rotation needed to correct the page", () => {
    expect(parseOsd(OSD_OUTPUT)).toEqual({
      orientation: 270,
      confidence: 3.49,
    });
  });

  test("derives the rotation when Rotate is absent", () => {
    expect(
      parseOsd("Orientation in degrees: 90\nOrientation confidence: 2"),
    ).toEqual({ orientation: 270, confidence: 2 });
  });

  test("returns null when no orientation is reported", () => {
    expect(
      parseOsd("Estimated resolution of descreen is not within range"),
    ).toBe(null);
  });
});

describe("detectOrientation", () => {
  test("trusts a confident OSD reading without probing rotations", async () => {
    const rotations: number[] = [];
    const result = await detectOrientation(
      new Uint8Array([7, 7, 7]),
      async () => "Rotate: 180\nOrientation confidence: 2.5",
      {
        rotate: (_png, degrees) => {
          rotations.push(degrees);
          return new Uint8Array([degrees]);
        },
      },
    );

    expect(result).toBe(180);
    expect(rotations).toEqual([]);
  });

  test("probes rotations and picks the one that needs no correction", async () => {
    const confidenceByRotation: Record<number, number> = {
      90: 1,
      180: 5,
      270: 2,
    };
    const recognize: TesseractRecognize = async (image) => {
      const bytes = image as Uint8Array;
      if (bytes.length === 1) {
        const degrees = bytes[0] ?? 0;
        return `Orientation in degrees: 0\nRotate: 0\nOrientation confidence: ${confidenceByRotation[degrees] ?? 0}`;
      }
      return "Orientation in degrees: 90\nRotate: 90\nOrientation confidence: 0.5";
    };

    const result = await detectOrientation(
      new Uint8Array([1, 2, 3]),
      recognize,
      {
        rotate: (_png, degrees) => new Uint8Array([degrees]),
      },
    );

    expect(result).toBe(180);
  });

  test("keeps the OSD reading when no rotation reads upright", async () => {
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
    const result = await orientPng(
      new Uint8Array([1, 2, 3]),
      async () => "Rotate: 90\nOrientation confidence: 3",
      { rotate: (_png, degrees) => new Uint8Array([degrees]) },
    );

    expect(Array.from(result)).toEqual([90]);
  });
});
