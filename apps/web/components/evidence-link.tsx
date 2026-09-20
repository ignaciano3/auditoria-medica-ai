import { findings } from "@audit/lib/i18n";
import type { Route } from "next";
import Link from "next/link";
import { viewerAnchorId } from "./pdf-viewer-utils.ts";
import { buttonVariants } from "./ui/button.tsx";

export function EvidenceLink({
  documentId,
  page,
  hash = viewerAnchorId,
  label,
  inline = false,
}: {
  documentId: string;
  page: number;
  hash?: string | undefined;
  label?: string | undefined;
  inline?: boolean | undefined;
}) {
  const pathname = `/documents/${documentId}` as Route;
  const href = { pathname, query: { page }, hash };

  return (
    <Link
      className={
        inline
          ? "mx-0.5 cursor-pointer rounded border border-border px-1 font-medium text-brand underline underline-offset-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          : buttonVariants({ variant: "secondary", size: "sm" })
      }
      href={href}
    >
      {label ?? findings.viewPage(page)}
    </Link>
  );
}

export function EvidenceLinks({
  documentId,
  pages,
  hash,
}: {
  documentId: string;
  pages: number[];
  hash?: string | undefined;
}) {
  if (pages.length === 0) return null;

  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {pages.map((page) => (
        <EvidenceLink
          key={page}
          documentId={documentId}
          page={page}
          hash={hash}
        />
      ))}
    </span>
  );
}
