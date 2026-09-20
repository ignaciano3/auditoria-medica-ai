import type { AuditSummary, Finding } from "@audit/domain";
import { clinicalRecord, summary as summaryLabels } from "@audit/lib/i18n";
import { sourcePages } from "../lib/clinical-record-view.ts";
import { sortFindings } from "../lib/findings-view.ts";
import { durationText } from "../lib/summary-view.ts";
import { describeEntry } from "../lib/timeline-view.ts";
import {
  CollapsibleSection,
  RecordEmpty,
  RecordFields,
} from "./clinical-record-primitives.tsx";
import { EvidenceLinks } from "./evidence-link.tsx";

function FindingList({
  documentId,
  items,
}: {
  documentId: string;
  items: Finding[];
}) {
  if (items.length === 0) return <RecordEmpty />;

  return (
    <ul className="flex list-none flex-col gap-2">
      {sortFindings(items).map((finding) => (
        <li
          key={finding.id}
          className="rounded-lg border border-border bg-muted/30 p-3"
        >
          <p className="font-semibold [overflow-wrap:anywhere]">
            {finding.title}
          </p>
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {finding.explanation}
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {summaryLabels.requiresHumanReview}
          </p>
          <div className="mt-2">
            <EvidenceLinks
              documentId={documentId}
              pages={sourcePages(
                finding.evidence.map((evidence) => evidence.source),
              )}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AuditSummaryView({
  documentId,
  summary,
}: {
  documentId: string;
  summary: AuditSummary;
}) {
  return (
    <section className="flex flex-col gap-6">
      <CollapsibleSection title={summaryLabels.auditTitle} defaultOpen>
        <RecordFields
          documentId={documentId}
          fields={[
            {
              label: summaryLabels.duration,
              value: durationText(summary.durationDays),
              sources: [],
            },
            {
              label: clinicalRecord.reason,
              value: summary.reason?.value,
              sources: summary.reason?.sources ?? [],
            },
          ]}
        />
        <p className="text-sm font-medium text-muted-foreground">
          {summaryLabels.reviewCount(summary.requiresReview)}
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        title={summaryLabels.documentedFacts}
        count={summary.majorEvents.length}
        defaultOpen
      >
        {summary.majorEvents.length === 0 ? (
          <RecordEmpty />
        ) : (
          <ul className="flex list-none flex-col gap-2">
            {summary.majorEvents.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
              >
                <span>{describeEntry(entry)}</span>
                <EvidenceLinks
                  documentId={documentId}
                  pages={sourcePages(entry.sources)}
                />
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={summaryLabels.treatmentChanges}
        count={summary.treatmentChanges.length}
      >
        {summary.treatmentChanges.length === 0 ? (
          <RecordEmpty />
        ) : (
          <ul className="flex list-none flex-col gap-2">
            {summary.treatmentChanges.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
              >
                <span>{describeEntry(entry)}</span>
                <EvidenceLinks
                  documentId={documentId}
                  pages={sourcePages(entry.sources)}
                />
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={summaryLabels.inconsistencies}
        count={summary.inconsistencies.length}
        defaultOpen
      >
        <FindingList documentId={documentId} items={summary.inconsistencies} />
      </CollapsibleSection>

      <CollapsibleSection
        title={summaryLabels.documentationGaps}
        count={summary.documentationGaps.length}
        defaultOpen
      >
        <FindingList
          documentId={documentId}
          items={summary.documentationGaps}
        />
      </CollapsibleSection>

      <CollapsibleSection title={summaryLabels.aiInterpretation}>
        <p className="text-sm text-muted-foreground">
          {summaryLabels.requiresHumanReview}
        </p>
      </CollapsibleSection>
    </section>
  );
}
