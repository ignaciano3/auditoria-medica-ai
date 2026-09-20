/// <reference lib="dom" />

import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { EvidenceLink } from "./evidence-link.tsx";

describe("EvidenceLink", () => {
  test("renders as a button-sized link by default", () => {
    const { getByRole } = render(
      <EvidenceLink documentId="d1" page={3} label="[3]" />,
    );
    const link = getByRole("link");
    expect(link.className).toContain("h-8");
  });

  test("omits button sizing in inline mode", () => {
    const { getByRole } = render(
      <EvidenceLink documentId="d1" page={3} label="[3]" inline />,
    );
    const link = getByRole("link");
    expect(link.className).not.toContain("h-8");
    expect(link.className).not.toContain("px-3");
    expect(link.getAttribute("href")).toContain("page=3");
  });
});
