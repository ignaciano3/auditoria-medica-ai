import { Fragment, type ReactNode } from "react";

export type InlineMarkdownNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineMarkdownNode[] }
  | { type: "em"; children: InlineMarkdownNode[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: InlineMarkdownNode[] }
  | { type: "checkbox"; checked: boolean };

const LINK_PATTERN = /^\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/;
const CHECKBOX_PATTERN = /^\[([ xX])\](?!\()/;

const ENTITY_PATTERN = /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g;

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: "\u00A0",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "\u2013",
  mdash: "\u2014",
};

function fromCodePoint(code: number): string | null {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return null;
  return String.fromCodePoint(code);
}

function decodeEntities(input: string): string {
  return input.replace(ENTITY_PATTERN, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isNaN(code) ? match : (fromCodePoint(code) ?? match);
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? match : (fromCodePoint(code) ?? match);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function hasInnerContent(inner: string): boolean {
  return inner.length > 0 && !/^\s/.test(inner) && !/\s$/.test(inner);
}

export function parseInlineMarkdown(input: string): InlineMarkdownNode[] {
  const nodes: InlineMarkdownNode[] = [];
  let text = "";
  let index = 0;

  const flushText = () => {
    if (text.length > 0) {
      nodes.push({ type: "text", value: decodeEntities(text) });
      text = "";
    }
  };

  while (index < input.length) {
    const char = input[index];

    if (char === "`") {
      const end = input.indexOf("`", index + 1);
      if (end !== -1) {
        flushText();
        nodes.push({ type: "code", value: input.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    if (char === "[") {
      const match = LINK_PATTERN.exec(input.slice(index));
      if (match) {
        flushText();
        nodes.push({
          type: "link",
          href: match[2] ?? "",
          children: parseInlineMarkdown(match[1] ?? ""),
        });
        index += match[0].length;
        continue;
      }
      const checkbox = CHECKBOX_PATTERN.exec(input.slice(index));
      if (checkbox) {
        flushText();
        nodes.push({ type: "checkbox", checked: checkbox[1] !== " " });
        index += checkbox[0].length;
        continue;
      }
    }

    if (char === "*" || char === "_") {
      const isDouble = input[index + 1] === char;
      const delimiter = isDouble ? char + char : char;
      const end = input.indexOf(delimiter, index + delimiter.length);
      if (end !== -1) {
        const inner = input.slice(index + delimiter.length, end);
        if (hasInnerContent(inner)) {
          flushText();
          const children = parseInlineMarkdown(inner);
          nodes.push(
            isDouble ? { type: "strong", children } : { type: "em", children },
          );
          index = end + delimiter.length;
          continue;
        }
      }
    }

    text += char;
    index += 1;
  }

  flushText();
  return nodes;
}

function renderNodes(
  nodes: InlineMarkdownNode[],
  keyPrefix: string,
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}${index}`;
    switch (node.type) {
      case "text":
        return <Fragment key={key}>{node.value}</Fragment>;
      case "strong":
        return (
          <strong key={key} className="font-semibold">
            {renderNodes(node.children, `${key}.`)}
          </strong>
        );
      case "em":
        return <em key={key}>{renderNodes(node.children, `${key}.`)}</em>;
      case "code":
        return (
          <code
            key={key}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
          >
            {node.value}
          </code>
        );
      case "link":
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand underline underline-offset-2"
          >
            {renderNodes(node.children, `${key}.`)}
          </a>
        );
      case "checkbox":
        return (
          <input
            key={key}
            type="checkbox"
            checked={node.checked}
            disabled
            readOnly
            className="mr-1 inline-block size-3.5 shrink-0 align-[-2px] accent-brand"
          />
        );
      default:
        return null;
    }
  });
}

export function renderInlineMarkdown(input: string): ReactNode[] {
  return renderNodes(parseInlineMarkdown(input), "");
}
