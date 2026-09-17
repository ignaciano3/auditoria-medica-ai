import * as mupdf from "mupdf";

export const DEFAULT_RENDER_DPI = 300;
export const DEFAULT_RENDER_SCALE = DEFAULT_RENDER_DPI / 72;

export function inspectPdf(bytes: Uint8Array): { pageCount: number } {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    return { pageCount: doc.countPages() };
  } finally {
    doc.destroy();
  }
}

export async function renderPdfPages(
  bytes: Uint8Array,
  options: { scale?: number } = {},
): Promise<
  Array<{ pageNumber: number; png: Uint8Array; width: number; height: number }>
> {
  const scale = options.scale ?? DEFAULT_RENDER_SCALE;
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const pages: Array<{
    pageNumber: number;
    png: Uint8Array;
    width: number;
    height: number;
  }> = [];
  try {
    const count = doc.countPages();
    for (let index = 0; index < count; index += 1) {
      const page = doc.loadPage(index);
      try {
        const pixmap = page.toPixmap(
          mupdf.Matrix.scale(scale, scale),
          mupdf.ColorSpace.DeviceRGB,
          false,
          true,
        );
        try {
          pages.push({
            pageNumber: index + 1,
            png: new Uint8Array(pixmap.asPNG()),
            width: pixmap.getWidth(),
            height: pixmap.getHeight(),
          });
        } finally {
          pixmap.destroy();
        }
      } finally {
        page.destroy();
      }
    }
  } finally {
    doc.destroy();
  }
  return pages;
}
