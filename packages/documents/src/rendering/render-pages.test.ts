import { describe, expect, test } from "bun:test";
import { inspectPdf, renderPdfPages } from "./render-pages.ts";

const FIXTURE =
  process.env.PDF_FIXTURE_PATH ??
  `${import.meta.dir}/../../fixtures/sample.pdf`;

describe("renderPdfPages", () => {
  test("reports the page count and renders every page to PNG", async () => {
    const bytes = new Uint8Array(await Bun.file(FIXTURE).arrayBuffer());
    const info = inspectPdf(bytes);
    expect(info.pageCount).toBeGreaterThanOrEqual(1);
    const pages = await renderPdfPages(bytes, { scale: 1 });
    expect(pages).toHaveLength(info.pageCount);
    expect(pages[0]?.png.byteLength).toBeGreaterThan(0);
  });
});
