import * as mupdf from "mupdf";
import type { TesseractRecognize } from "./tesseract-ocr-provider.ts";

export type Orientation = 0 | 90 | 180 | 270;

export const ORIENTATIONS: readonly Orientation[] = [0, 90, 180, 270];

export const DEFAULT_OSD_MIN_CONFIDENCE = 1;

export type OsdReading = { orientation: Orientation; confidence: number };

export type RotationDeps = {
  rotate?: (png: Uint8Array, degrees: Orientation) => Uint8Array;
  minConfidence?: number;
};

export function parseOsd(output: string): OsdReading | null {
  const rotate = output.match(/Rotate:\s*(\d+)/i);
  const orientation = output.match(/Orientation in degrees:\s*(\d+)/i);
  let degrees: number | null = null;
  if (rotate) {
    degrees = Number(rotate[1]) % 360;
  } else if (orientation) {
    degrees = (360 - (Number(orientation[1]) % 360)) % 360;
  }
  if (degrees === null || !ORIENTATIONS.includes(degrees as Orientation)) {
    return null;
  }
  const confidence = output.match(/Orientation confidence:\s*([\d.]+)/i);
  return {
    orientation: degrees as Orientation,
    confidence: confidence ? Number(confidence[1]) : 0,
  };
}

function pngWidth(png: Uint8Array): number {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return view.getUint32(16);
}

export function rotatePng(png: Uint8Array, degrees: Orientation): Uint8Array {
  if (degrees === 0) return png;
  const doc = mupdf.Document.openDocument(png, "image/png");
  try {
    const page = doc.loadPage(0);
    try {
      const bounds = page.getBounds();
      const scale = pngWidth(png) / (bounds[2] - bounds[0]);
      const matrix = mupdf.Matrix.concat(
        mupdf.Matrix.scale(scale, scale),
        mupdf.Matrix.rotate(degrees),
      );
      const pixmap = page.toPixmap(
        matrix,
        mupdf.ColorSpace.DeviceRGB,
        false,
        false,
      );
      try {
        return new Uint8Array(pixmap.asPNG());
      } finally {
        pixmap.destroy();
      }
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}

async function readOsd(
  png: Uint8Array,
  recognize: TesseractRecognize,
): Promise<OsdReading | null> {
  try {
    return parseOsd(await recognize(png, { psm: 0, lang: "osd" }));
  } catch {
    return null;
  }
}

function safeRotate(
  png: Uint8Array,
  degrees: Orientation,
  rotate: (png: Uint8Array, degrees: Orientation) => Uint8Array,
): Uint8Array | null {
  try {
    return rotate(png, degrees);
  } catch {
    return null;
  }
}

export async function detectOrientation(
  png: Uint8Array,
  recognize: TesseractRecognize,
  deps: RotationDeps = {},
): Promise<Orientation> {
  const rotate = deps.rotate ?? rotatePng;
  const minConfidence = deps.minConfidence ?? DEFAULT_OSD_MIN_CONFIDENCE;

  const osd = await readOsd(png, recognize);
  if (osd && osd.confidence >= minConfidence) return osd.orientation;

  let best: { degrees: Orientation; confidence: number } | null = null;
  for (const degrees of ORIENTATIONS) {
    const candidate =
      degrees === 0
        ? osd
        : await (async () => {
            const rotated = safeRotate(png, degrees, rotate);
            return rotated ? readOsd(rotated, recognize) : null;
          })();
    if (candidate && candidate.orientation === 0) {
      if (!best || candidate.confidence > best.confidence) {
        best = { degrees, confidence: candidate.confidence };
      }
    }
  }

  return best?.degrees ?? osd?.orientation ?? 0;
}

export async function orientPng(
  png: Uint8Array,
  recognize: TesseractRecognize,
  deps: RotationDeps = {},
): Promise<Uint8Array> {
  const rotate = deps.rotate ?? rotatePng;
  const degrees = await detectOrientation(png, recognize, deps);
  return safeRotate(png, degrees, rotate) ?? png;
}
