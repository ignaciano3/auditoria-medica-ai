/// <reference lib="dom" />

import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { renderChatContent } from "./chat-markdown.tsx";

describe("renderChatContent", () => {
  test("renders a markdown table from the assistant", () => {
    const content = [
      "| Fecha | TA |",
      "| --- | --- |",
      "| 14/02 | 120/80 |",
    ].join("\n");
    const { container, getByText } = render(
      <div>
        {renderChatContent({ documentId: "d1", content, citedPages: [] })}
      </div>,
    );
    expect(container.querySelector("table")).not.toBeNull();
    expect(getByText("120/80").tagName).toBe("TD");
  });

  test("keeps allowed citations as evidence links", () => {
    const { getByRole } = render(
      <div>
        {renderChatContent({
          documentId: "d1",
          content: "El paciente mejoro [p.5].",
          citedPages: [5],
        })}
      </div>,
    );
    const link = getByRole("link");
    expect(link.getAttribute("href")).toContain("page=5");
    expect(link.textContent).toBe("[5]");
  });

  test("renders citations inside table cells", () => {
    const content = [
      "| Fecha | TA |",
      "| --- | --- |",
      "| 14/02 [p.5] | 120/80 |",
    ].join("\n");
    const { getByRole } = render(
      <div>
        {renderChatContent({ documentId: "d1", content, citedPages: [5] })}
      </div>,
    );
    expect(getByRole("link").getAttribute("href")).toContain("page=5");
  });

  test("drops citations that are not allowed pages", () => {
    const { queryByRole } = render(
      <div>
        {renderChatContent({
          documentId: "d1",
          content: "Dato dudoso [p.99].",
          citedPages: [5],
        })}
      </div>,
    );
    expect(queryByRole("link")).toBeNull();
  });
});
