import { splitCitations } from "@audit/ai/chat/citations";
import { Fragment, type ReactNode } from "react";
import { EvidenceLink } from "../components/evidence-link.tsx";
import { renderBlockMarkdown } from "./block-markdown.tsx";
import { renderInlineMarkdown } from "./inline-markdown.tsx";

export function renderChatContent({
  documentId,
  content,
  citedPages,
}: {
  documentId: string;
  content: string;
  citedPages: number[];
}): ReactNode {
  const renderInline = (text: string) =>
    splitCitations(text, citedPages).map((segment, index) =>
      segment.kind === "text" ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: citation segments are immutable for a rendered message
        <Fragment key={index}>{renderInlineMarkdown(segment.text)}</Fragment>
      ) : (
        <EvidenceLink
          // biome-ignore lint/suspicious/noArrayIndexKey: citation segments are immutable for a rendered message
          key={index}
          documentId={documentId}
          page={segment.page}
          label={`[${segment.page}]`}
          inline
        />
      ),
    );

  return renderBlockMarkdown(content, renderInline);
}
