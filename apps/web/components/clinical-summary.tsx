import type { ClinicalSummary, Finding } from "@audit/domain";
import { FINDING_SEVERITIES } from "@audit/domain";
import {
  clinicalRecord,
  findings as findingsLabels,
  summary as summaryLabels,
  ui,
} from "@audit/lib/i18n";
import {
  diagnosisItemKey,
  displayValue,
  sourcePages,
} from "../lib/clinical-record-view.ts";
import { countBySeverity } from "../lib/findings-view.ts";
import { durationText } from "../lib/summary-view.ts";
import {
  CollapsibleSection,
  type RecordFieldSpec,
  RecordFields,
} from "./clinical-record-primitives.tsx";
import { EvidenceLinks } from "./evidence-link.tsx";

function findingsText(findings: Finding[]): string {
  const counts = countBySeverity(findings);
  const severities = FINDING_SEVERITIES.filter(
    (severity) => counts[severity] > 0,
  )
    .map(
      (severity) => `${findingsLabels.severity[severity]}: ${counts[severity]}`,
    )
    .join(" · ");

  return [summaryLabels.reviewCount(findings.length), severities]
    .filter((part) => part !== "")
    .join(" · ");
}

export function ClinicalSummaryView({
  documentId,
  summary,
  findings,
}: {
  documentId: string;
  summary: ClinicalSummary;
  findings: Finding[];
}) {
  const fields: RecordFieldSpec[] = [
    {
      label: clinicalRecord.name,
      value: summary.patient.name?.value,
      sources: summary.patient.name?.sources ?? [],
    },
    {
      label: clinicalRecord.age,
      value: summary.patient.age?.value,
      sources: summary.patient.age?.sources ?? [],
    },
    {
      label: clinicalRecord.sex,
      value: summary.patient.sex?.value,
      sources: summary.patient.sex?.sources ?? [],
    },
    {
      label: clinicalRecord.birthDate,
      value: summary.patient.birthDate?.value,
      sources: summary.patient.birthDate?.sources ?? [],
    },
    {
      label: clinicalRecord.admissionDate,
      value: summary.admissionDate?.value,
      sources: summary.admissionDate?.sources ?? [],
    },
    {
      label: clinicalRecord.dischargeDate,
      value: summary.dischargeDate?.value,
      sources: summary.dischargeDate?.sources ?? [],
    },
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
      label: ui.findings,
      value: findingsText(findings),
      sources: [],
    },
  ];

  return (
    <CollapsibleSection title={ui.summary}>
      <RecordFields documentId={documentId} fields={fields} />
      {summary.diagnoses.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {clinicalRecord.diagnoses}
          </h3>
          <ul className="flex list-none flex-col gap-1">
            {summary.diagnoses.map((diagnosis, index) => (
              <li
                key={diagnosisItemKey(diagnosis.value, index)}
                className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
              >
                <span>{displayValue(diagnosis.value)}</span>
                <EvidenceLinks
                  documentId={documentId}
                  pages={sourcePages(diagnosis.sources)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </CollapsibleSection>
  );
}
