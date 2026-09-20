import type { AuditSummary } from "@audit/domain";
import { clinicalRecord, summary as summaryLabels } from "@audit/lib/i18n";
import { sourcePages } from "../lib/clinical-record-view.ts";
import { durationText } from "../lib/summary-view.ts";
import { describeEntry } from "../lib/timeline-view.ts";
import {
  CollapsibleSection,
  RecordEmpty,
  RecordFields,
} from "./clinical-record-primitives.tsx";
import { EvidenceLinks } from "./evidence-link.tsx";

export function AuditSummaryView({
  documentId,
  summary,
}: {
  documentId: string;
  summary: AuditSummary;
}) {
  return (
    <section className="flex flex-col gap-6">
      <CollapsibleSection title={summaryLabels.auditTitle}>
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
            {
              label: summaryLabels.inconsistencies,
              value: summary.inconsistencies.length,
              sources: [],
            },
            {
              label: summaryLabels.documentationGaps,
              value: summary.documentationGaps.length,
              sources: [],
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

      <CollapsibleSection title={summaryLabels.aiInterpretation}>
        <p className="text-sm text-muted-foreground">
          {summaryLabels.requiresHumanReview}
        </p>
      </CollapsibleSection>
    </section>
  );
}
