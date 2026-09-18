import type { Source } from "@audit/domain";
import { clinicalRecord } from "@audit/lib/i18n";
import { Fragment, type ReactNode } from "react";
import {
  displayValue,
  isPlaceholderValue,
  sourcePages,
} from "../lib/clinical-record-view.ts";
import { EvidenceLinks } from "./evidence-link.tsx";
import { Section } from "./ui/section.tsx";

export type RecordFieldSpec = {
  label: string;
  value: string | number | undefined;
  sources: Source[];
};

export function RecordValue({ value }: { value: string | number | undefined }) {
  const text = displayValue(value);
  if (text === undefined) return null;
  if (isPlaceholderValue(text)) {
    return (
      <span className="font-semibold text-warning">
        {clinicalRecord.invalidValue}
      </span>
    );
  }
  return <span>{text}</span>;
}

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
    <Section title={title} count={count} defaultOpen={defaultOpen}>
      <div className="flex flex-col gap-3">{children}</div>
    </Section>
  );
}

export function RecordField({
  label,
  value,
  documentId,
  sources,
  showEvidence = true,
}: {
  label: string;
  value: string | number | undefined;
  documentId: string;
  sources: Source[];
  showEvidence?: boolean;
}) {
  const text = displayValue(value);
  if (text === undefined) return null;

  return (
    <>
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]">
        <RecordValue value={value} />
        {showEvidence ? (
          <EvidenceLinks documentId={documentId} pages={sourcePages(sources)} />
        ) : null}
      </dd>
    </>
  );
}

export function RecordFields({
  documentId,
  fields,
  showEvidence = true,
}: {
  documentId: string;
  fields: RecordFieldSpec[];
  showEvidence?: boolean;
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
            showEvidence={showEvidence}
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
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
      {title !== undefined ? (
        <p className="font-semibold [overflow-wrap:anywhere]">{title}</p>
      ) : null}
      <RecordFields
        documentId={documentId}
        fields={fields}
        showEvidence={false}
      />
      <EvidenceLinks documentId={documentId} pages={pages} />
    </li>
  );
}

export function RecordEmpty() {
  return (
    <p className="text-sm text-muted-foreground">{clinicalRecord.noInfo}</p>
  );
}
