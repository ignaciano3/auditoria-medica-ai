/// <reference lib="dom" />

import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import {
  parseInlineMarkdown,
  renderInlineMarkdown,
} from "./inline-markdown.tsx";

describe("parseInlineMarkdown", () => {
  test("returns plain text as a single text node", () => {
    expect(parseInlineMarkdown("sin formato")).toEqual([
      { type: "text", value: "sin formato" },
    ]);
  });

  test("parses bold with ** and __", () => {
    expect(parseInlineMarkdown("**ALMIRON ARIEL ALBERTO**")).toEqual([
      {
        type: "strong",
        children: [{ type: "text", value: "ALMIRON ARIEL ALBERTO" }],
      },
    ]);
    expect(parseInlineMarkdown("__importante__")).toEqual([
      { type: "strong", children: [{ type: "text", value: "importante" }] },
    ]);
  });

  test("parses italic with * and _", () => {
    expect(parseInlineMarkdown("hoja de *indicaciones*")).toEqual([
      { type: "text", value: "hoja de " },
      { type: "em", children: [{ type: "text", value: "indicaciones" }] },
    ]);
    expect(parseInlineMarkdown("_énfasis_")).toEqual([
      { type: "em", children: [{ type: "text", value: "énfasis" }] },
    ]);
  });

  test("parses inline code", () => {
    expect(parseInlineMarkdown("el valor `190/110` registrado")).toEqual([
      { type: "text", value: "el valor " },
      { type: "code", value: "190/110" },
      { type: "text", value: " registrado" },
    ]);
  });

  test("parses links with http and https", () => {
    expect(
      parseInlineMarkdown("ver [historia](https://example.com/hc)"),
    ).toEqual([
      { type: "text", value: "ver " },
      {
        type: "link",
        href: "https://example.com/hc",
        children: [{ type: "text", value: "historia" }],
      },
    ]);
  });

  test("keeps non-http link targets as literal text", () => {
    expect(parseInlineMarkdown("[x](javascript:alert(1))")).toEqual([
      { type: "text", value: "[x](javascript:alert(1))" },
    ]);
  });

  test("mixes formatting and surrounding text", () => {
    expect(
      parseInlineMarkdown("El paciente **ALMIRON** consta en *página 3*."),
    ).toEqual([
      { type: "text", value: "El paciente " },
      { type: "strong", children: [{ type: "text", value: "ALMIRON" }] },
      { type: "text", value: " consta en " },
      { type: "em", children: [{ type: "text", value: "página 3" }] },
      { type: "text", value: "." },
    ]);
  });

  test("leaves unmatched delimiters as literal text", () => {
    expect(parseInlineMarkdown("2 * 3 = 6")).toEqual([
      { type: "text", value: "2 * 3 = 6" },
    ]);
  });

  test("decodes &nbsp; into a non-breaking space", () => {
    expect(parseInlineMarkdown("TA&nbsp;120/80")).toEqual([
      { type: "text", value: "TA\u00A0120/80" },
    ]);
  });

  test("decodes common named and numeric entities", () => {
    expect(parseInlineMarkdown("A &amp; B &#39;x&#39; &#x41;")).toEqual([
      { type: "text", value: "A & B 'x' A" },
    ]);
  });

  test("leaves unknown entities as literal text", () => {
    expect(parseInlineMarkdown("&foo; &nbsp")).toEqual([
      { type: "text", value: "&foo; &nbsp" },
    ]);
  });

  test("parses inline checkboxes", () => {
    expect(parseInlineMarkdown("TA [x] control [ ] pendiente")).toEqual([
      { type: "text", value: "TA " },
      { type: "checkbox", checked: true },
      { type: "text", value: " control " },
      { type: "checkbox", checked: false },
      { type: "text", value: " pendiente" },
    ]);
  });
});

describe("renderInlineMarkdown", () => {
  test("renders strong, em and code elements", () => {
    const { container, getByText } = render(
      <div>{renderInlineMarkdown("**fuerte** y *suave* y `código`")}</div>,
    );
    expect(getByText("fuerte").tagName).toBe("STRONG");
    expect(getByText("suave").tagName).toBe("EM");
    expect(getByText("código").tagName).toBe("CODE");
    expect(container.textContent).toBe("fuerte y suave y código");
  });

  test("renders links with safe rel and target", () => {
    const { getByRole } = render(
      <div>{renderInlineMarkdown("[ver](https://example.com)")}</div>,
    );
    const link = getByRole("link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  test("never injects raw HTML", () => {
    const { container } = render(
      <div>{renderInlineMarkdown("<img src=x onerror=alert(1)> **ok**")}</div>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("<img src=x onerror=alert(1)> ok");
  });

  test("renders nbsp as a non-breaking space, not the literal entity", () => {
    const { container } = render(<div>{renderInlineMarkdown("a&nbsp;b")}</div>);
    expect(container.textContent).toBe("a\u00A0b");
  });

  test("renders inline checkboxes with their checked state", () => {
    const { getAllByRole } = render(
      <div>{renderInlineMarkdown("A [x] B [ ] C")}</div>,
    );
    const boxes = getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes[0]?.checked).toBe(true);
    expect(boxes[1]?.checked).toBe(false);
  });
});
