import { findings } from "@audit/lib/i18n";
import type { Route } from "next";
import Link from "next/link";
import { viewerAnchorId } from "./pdf-viewer-utils.ts";
import { buttonVariants } from "./ui/button.tsx";

export function EvidenceLink({
  documentId,
  page,
  hash = viewerAnchorId,
}: {
  documentId: string;
  page: number;
  hash?: string | undefined;
}) {
  const pathname = `/documents/${documentId}` as Route;
  const href = { pathname, query: { page }, hash };

  return (
    <Link
      className={buttonVariants({ variant: "secondary", size: "sm" })}
      href={href}
    >
      {findings.viewPage(page)}
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
