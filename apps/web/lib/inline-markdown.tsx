import { Fragment, type ReactNode } from "react";

export type InlineMarkdownNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineMarkdownNode[] }
  | { type: "em"; children: InlineMarkdownNode[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: InlineMarkdownNode[] };

const LINK_PATTERN = /^\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/;

function hasInnerContent(inner: string): boolean {
  return inner.length > 0 && !/^\s/.test(inner) && !/\s$/.test(inner);
}

export function parseInlineMarkdown(input: string): InlineMarkdownNode[] {
  const nodes: InlineMarkdownNode[] = [];
  let text = "";
  let index = 0;

  const flushText = () => {
    if (text.length > 0) {
      nodes.push({ type: "text", value: text });
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
      default:
        return null;
    }
  });
}

export function renderInlineMarkdown(input: string): ReactNode[] {
  return renderNodes(parseInlineMarkdown(input), "");
}
