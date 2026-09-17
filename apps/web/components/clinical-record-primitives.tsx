import type { Source } from "@audit/domain";
import { clinicalRecord } from "@audit/lib/i18n";
import { Fragment, type ReactNode } from "react";
import { displayValue, sourcePages } from "../lib/clinical-record-view.ts";
import { EvidenceLinks } from "./evidence-link.tsx";

export type RecordFieldSpec = {
  label: string;
  value: string | number | undefined;
  sources: Source[];
};

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number | undefined;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="rounded-lg border border-foreground/20 p-4"
      open={defaultOpen}
    >
      <summary className="cursor-pointer text-base font-semibold">
        {title}
        {count !== undefined ? ` (${count})` : ""}
      </summary>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}

export function RecordField({
  label,
  value,
  documentId,
  sources,
}: {
  label: string;
  value: string | number | undefined;
  documentId: string;
  sources: Source[];
}) {
  const text = displayValue(value);
  if (text === undefined) return null;

  return (
    <>
      <dt className="font-semibold text-foreground/70">{label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]">
        <span>{text}</span>
        <EvidenceLinks documentId={documentId} pages={sourcePages(sources)} />
      </dd>
    </>
  );
}

export function RecordFields({
  documentId,
  fields,
}: {
  documentId: string;
  fields: RecordFieldSpec[];
}) {
  const visible = fields.filter(
    (field) => displayValue(field.value) !== undefined,
  );
  if (visible.length === 0) return null;

  return (
    <dl className="grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 gap-y-1">
      {visible.map((field) => (
        <Fragment key={field.label}>
          <RecordField
            label={field.label}
            value={field.value}
            documentId={documentId}
            sources={field.sources}
          />
        </Fragment>
      ))}
    </dl>
  );
}

export function RecordItem({
  documentId,
  title,
  fields,
  pages,
}: {
  documentId: string;
  title?: string | undefined;
  fields: RecordFieldSpec[];
  pages: number[];
}) {
  return (
    <li className="flex flex-col gap-2 rounded-md border border-foreground/15 p-3">
      {title !== undefined ? (
        <p className="font-semibold [overflow-wrap:anywhere]">{title}</p>
      ) : null}
      <RecordFields documentId={documentId} fields={fields} />
      <EvidenceLinks documentId={documentId} pages={pages} />
    </li>
  );
}

export function RecordEmpty() {
  return <p className="text-sm text-foreground/60">{clinicalRecord.noInfo}</p>;
}
