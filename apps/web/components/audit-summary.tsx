import type { AuditSummary } from "@audit/domain";
import { summary as summaryLabels } from "@audit/lib/i18n";
import {
  CollapsibleSection,
  RecordFields,
} from "./clinical-record-primitives.tsx";

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
      </CollapsibleSection>

      <CollapsibleSection title={summaryLabels.aiInterpretation}>
        <p className="text-sm text-muted-foreground">
          {summaryLabels.requiresHumanReview}
        </p>
      </CollapsibleSection>
    </section>
  );
}
