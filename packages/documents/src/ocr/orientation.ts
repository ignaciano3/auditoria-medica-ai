import * as mupdf from "mupdf";
import { OCR_LANGUAGE } from "./ocr-provider.ts";
import type { TesseractRecognize } from "./tesseract-ocr-provider.ts";

export type Orientation = 0 | 90 | 180 | 270;

export const ORIENTATIONS: readonly Orientation[] = [0, 90, 180, 270];

export type OsdReading = {
  orientation: Orientation;
  confidence: number;
  scriptConfidence: number;
};

export type RotationDeps = {
  rotate?: (png: Uint8Array, degrees: Orientation) => Uint8Array;
};

const SPANISH_HINTS = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "y",
  "en",
  "con",
  "por",
  "para",
  "fecha",
  "hora",
  "paciente",
  "nombre",
  "apellido",
  "edad",
  "cama",
  "ingreso",
  "internacion",
  "internación",
  "evolucion",
  "evolución",
  "enfermeria",
  "enfermería",
  "clinica",
  "clínica",
  "medicamentos",
  "administracion",
  "administración",
  "indicaciones",
  "cuidados",
  "intensivos",
  "signos",
  "vitales",
  "control",
  "alergia",
  "diagnostico",
  "diagnóstico",
  "tratamiento",
  "laboratorio",
  "providencia",
  "sello",
  "matricula",
  "matrícula",
  "turno",
]);

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
  const scriptConfidence = output.match(/Script confidence:\s*([\d.]+)/i);
  return {
    orientation: degrees as Orientation,
    confidence: confidence ? Number(confidence[1]) : 0,
    scriptConfidence: scriptConfidence ? Number(scriptConfidence[1]) : 0,
  };
}

export function scoreText(text: string): number {
  const normalized = text.toLowerCase();
  const letters = normalized.match(/[a-záéíóúüñ]/g)?.length ?? 0;
  const tokens = normalized.match(/[a-záéíóúüñ]+/g) ?? [];
  let hints = 0;
  for (const token of tokens) {
    if (SPANISH_HINTS.has(token)) hints += 1;
  }
  return hints * 1000 + letters;
}

async function scoreOrientation(
  png: Uint8Array,
  recognize: TesseractRecognize,
): Promise<number> {
  try {
    const text = await recognize(png, { psm: 6, lang: OCR_LANGUAGE });
    return scoreText(text);
  } catch {
    return -1;
  }
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

  const osd = await readOsd(png, recognize);

  // Tesseract OSD is unreliable on handwritten tables: it often reports the
  // wrong script with high confidence and an orientation that is 180 degrees
  // off. Always compare the OSD candidate with its half-turn opposite by how
  // much real Spanish text each produces, and keep the best.
  const candidates: Orientation[] = osd
    ? [osd.orientation, ((osd.orientation + 180) % 360) as Orientation]
    : [...ORIENTATIONS];

  let best: { degrees: Orientation; score: number } | null = null;
  for (const degrees of candidates) {
    const image = degrees === 0 ? png : safeRotate(png, degrees, rotate);
    if (image === null) continue;
    const score = await scoreOrientation(image, recognize);
    if (best === null || score > best.score) {
      best = { degrees, score };
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
