// biome-ignore-all lint/suspicious/noArrayIndexKey: transcript blocks are immutable for a given render, so positional keys are stable
import { createElement, type ReactNode } from "react";
import { renderInlineMarkdown } from "./inline-markdown.tsx";

export type BlockListKind = "unordered" | "ordered" | "checkbox";

export type MarkdownListItem = { text: string; checked?: boolean };

export type BlockMarkdownNode =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "list"; kind: BlockListKind; items: MarkdownListItem[] }
  | { type: "table"; header: string[]; rows: string[][] };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^[-*+]\s+(.*)$/;
const ORDERED_RE = /^\d+[.)]\s+(.*)$/;
const CHECKBOX_RE = /^\[([ xX])\]\s*(.*)$/;

function tableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;
  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  return cells.length > 0 ? cells : null;
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function isTableStart(lines: string[], index: number): boolean {
  const header = tableRow(lines[index] ?? "");
  if (header === null) return false;
  const separator = tableRow(lines[index + 1] ?? "");
  return separator !== null && isSeparatorRow(separator);
}

type ListMarker = { kind: BlockListKind; text: string; checked?: boolean };

function listMarker(line: string): ListMarker | null {
  const trimmed = line.trim();
  const ordered = ORDERED_RE.exec(trimmed);
  if (ordered) return { kind: "ordered", text: ordered[1] ?? "" };
  const bullet = BULLET_RE.exec(trimmed);
  if (!bullet) return null;
  const content = bullet[1] ?? "";
  const checkbox = CHECKBOX_RE.exec(content);
  if (checkbox) {
    return {
      kind: "checkbox",
      text: (checkbox[2] ?? "").trim(),
      checked: checkbox[1] !== " ",
    };
  }
  return { kind: "unordered", text: content };
}

export function parseBlockMarkdown(input: string): BlockMarkdownNode[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const nodes: BlockMarkdownNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const heading = HEADING_RE.exec(line.trim());
    if (heading) {
      nodes.push({
        type: "heading",
        level: (heading[1] ?? "#").length,
        text: heading[2] ?? "",
      });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const header = tableRow(line) ?? [];
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const row = tableRow(lines[index] ?? "");
        if (row === null || isSeparatorRow(row)) break;
        rows.push(row);
        index += 1;
      }
      nodes.push({ type: "table", header, rows });
      continue;
    }

    const first = listMarker(line);
    if (first) {
      const kind = first.kind;
      const items: MarkdownListItem[] = [];
      while (index < lines.length) {
        const marker = listMarker(lines[index] ?? "");
        if (marker === null || marker.kind !== kind) break;
        if (kind === "checkbox") {
          items.push({ text: marker.text, checked: marker.checked === true });
        } else {
          items.push({ text: marker.text });
        }
        index += 1;
      }
      nodes.push({ type: "list", kind, items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (current.trim() === "") break;
      if (HEADING_RE.test(current.trim()) || listMarker(current) !== null)
        break;
      if (isTableStart(lines, index)) break;
      paragraph.push(current);
      index += 1;
    }
    nodes.push({ type: "paragraph", text: paragraph.join("\n") });
  }

  return nodes;
}

const HEADING_CLASS = "text-sm font-semibold text-foreground";
const PARAGRAPH_CLASS =
  "whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]";
const CELL_CLASS = "border border-border px-2 py-1 align-top";

export type InlineRenderer = (text: string) => ReactNode;

function renderNode(
  node: BlockMarkdownNode,
  key: number,
  renderInline: InlineRenderer,
): ReactNode {
  switch (node.type) {
    case "heading":
      return createElement(
        `h${Math.min(Math.max(node.level, 1), 6)}`,
        { key, className: HEADING_CLASS },
        renderInline(node.text),
      );
    case "table":
      return (
        <div key={key} className="my-1 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {node.header.map((cell, cellIndex) => (
                  <th
                    key={`h${cellIndex}`}
                    className={`${CELL_CLASS} bg-muted/50 text-left font-medium`}
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {node.rows.map((row, rowIndex) => (
                <tr key={`r${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`c${cellIndex}`} className={CELL_CLASS}>
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "list": {
      const ListTag = node.kind === "ordered" ? "ol" : "ul";
      return createElement(
        ListTag,
        {
          key,
          className:
            node.kind === "ordered"
              ? "my-1 list-inside list-decimal space-y-0.5"
              : "my-1 list-inside list-disc space-y-0.5",
        },
        node.items.map((item, itemIndex) => {
          if (node.kind === "checkbox") {
            return (
              <li key={`i${itemIndex}`} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={item.checked === true}
                  disabled
                  readOnly
                  className="mt-0.5 size-3.5 shrink-0 accent-brand"
                />
                <span className="[overflow-wrap:anywhere]">
                  {renderInline(item.text)}
                </span>
              </li>
            );
          }
          return (
            <li key={`i${itemIndex}`} className="[overflow-wrap:anywhere]">
              {renderInline(item.text)}
            </li>
          );
        }),
      );
    }
    default:
      return (
        <p key={key} className={PARAGRAPH_CLASS}>
          {renderInline(node.text)}
        </p>
      );
  }
}

export function renderBlockMarkdown(
  input: string,
  renderInline: InlineRenderer = renderInlineMarkdown,
): ReactNode {
  return parseBlockMarkdown(input).map((node, index) =>
    renderNode(node, index, renderInline),
  );
}
