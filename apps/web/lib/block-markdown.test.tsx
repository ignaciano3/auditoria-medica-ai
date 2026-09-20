/// <reference lib="dom" />

import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { parseBlockMarkdown, renderBlockMarkdown } from "./block-markdown.tsx";

describe("parseBlockMarkdown", () => {
  test("parses a plain paragraph", () => {
    expect(parseBlockMarkdown("Paciente sin alergias conocidas")).toEqual([
      { type: "paragraph", text: "Paciente sin alergias conocidas" },
    ]);
  });

  test("keeps line breaks inside a paragraph", () => {
    expect(parseBlockMarkdown("Linea uno\nLinea dos")).toEqual([
      { type: "paragraph", text: "Linea uno\nLinea dos" },
    ]);
  });

  test("separates paragraphs on blank lines", () => {
    expect(parseBlockMarkdown("Primero\n\nSegundo")).toEqual([
      { type: "paragraph", text: "Primero" },
      { type: "paragraph", text: "Segundo" },
    ]);
  });

  test("parses headings with their level", () => {
    expect(parseBlockMarkdown("## Signos vitales")).toEqual([
      { type: "heading", level: 2, text: "Signos vitales" },
    ]);
  });

  test("parses a GFM table", () => {
    const input = [
      "| Fecha | TA | FC |",
      "| --- | --- | --- |",
      "| 14/02 | 120/80 | 80 |",
      "| 15/02 | 130/85 | 92 |",
    ].join("\n");
    expect(parseBlockMarkdown(input)).toEqual([
      {
        type: "table",
        header: ["Fecha", "TA", "FC"],
        rows: [
          ["14/02", "120/80", "80"],
          ["15/02", "130/85", "92"],
        ],
      },
    ]);
  });

  test("does not treat pipe-separated text as a table without a separator", () => {
    expect(parseBlockMarkdown("TA | FC")).toEqual([
      { type: "paragraph", text: "TA | FC" },
    ]);
  });

  test("parses a checkbox list", () => {
    const input = [
      "- [x] Control de signos vitales",
      "- [ ] Balance hidrico",
    ].join("\n");
    expect(parseBlockMarkdown(input)).toEqual([
      {
        type: "list",
        kind: "checkbox",
        items: [
          { text: "Control de signos vitales", checked: true },
          { text: "Balance hidrico", checked: false },
        ],
      },
    ]);
  });

  test("parses an unordered list", () => {
    expect(parseBlockMarkdown("- item a\n- item b")).toEqual([
      {
        type: "list",
        kind: "unordered",
        items: [{ text: "item a" }, { text: "item b" }],
      },
    ]);
  });

  test("parses an ordered list", () => {
    expect(parseBlockMarkdown("1. primero\n2. segundo")).toEqual([
      {
        type: "list",
        kind: "ordered",
        items: [{ text: "primero" }, { text: "segundo" }],
      },
    ]);
  });

  test("parses a mixed document", () => {
    const input = [
      "## Evolucion",
      "",
      "Paciente estable.",
      "",
      "| TA | FC |",
      "| --- | --- |",
      "| 120/80 | 80 |",
      "",
      "- [x] Apto para alta",
    ].join("\n");
    expect(parseBlockMarkdown(input)).toEqual([
      { type: "heading", level: 2, text: "Evolucion" },
      { type: "paragraph", text: "Paciente estable." },
      { type: "table", header: ["TA", "FC"], rows: [["120/80", "80"]] },
      {
        type: "list",
        kind: "checkbox",
        items: [{ text: "Apto para alta", checked: true }],
      },
    ]);
  });
});

describe("renderBlockMarkdown", () => {
  test("renders a table with header and body cells", () => {
    const input = [
      "| Fecha | TA |",
      "| --- | --- |",
      "| 14/02 | 120/80 |",
    ].join("\n");
    const { container, getByText, getAllByRole } = render(
      <div>{renderBlockMarkdown(input)}</div>,
    );
    expect(container.querySelector("table")).not.toBeNull();
    expect(getByText("Fecha").tagName).toBe("TH");
    expect(getByText("120/80").tagName).toBe("TD");
    expect(getAllByRole("row")).toHaveLength(2);
  });

  test("renders checked and unchecked checkboxes", () => {
    const input = "- [x] Hecho\n- [ ] Pendiente";
    const { getAllByRole, getByText } = render(
      <div>{renderBlockMarkdown(input)}</div>,
    );
    const boxes = getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes[0]?.checked).toBe(true);
    expect(boxes[1]?.checked).toBe(false);
    expect(getByText("Hecho")).toBeDefined();
  });

  test("renders headings and applies inline formatting", () => {
    const { container, getByText } = render(
      <div>{renderBlockMarkdown("## **Fiebre** alta")}</div>,
    );
    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Fiebre alta");
    expect(getByText("Fiebre").tagName).toBe("STRONG");
  });

  test("never injects raw HTML", () => {
    const { container } = render(
      <div>{renderBlockMarkdown("<img src=x onerror=alert(1)>")}</div>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("<img src=x onerror=alert(1)>");
  });
});
