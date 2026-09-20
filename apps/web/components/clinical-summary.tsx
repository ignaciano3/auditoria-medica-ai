import type { ClinicalSummary, MicrobiologyResult, Study } from "@audit/domain";
import { clinicalRecord, summary as summaryLabels } from "@audit/lib/i18n";
import {
  displayValue,
  medicationItemKey,
  mergeSourcePages,
  sourcePages,
} from "../lib/clinical-record-view.ts";
import { durationText } from "../lib/summary-view.ts";
import {
  CollapsibleSection,
  RecordEmpty,
  type RecordFieldSpec,
  RecordFields,
  RecordItem,
} from "./clinical-record-primitives.tsx";
import { EvidenceLinks } from "./evidence-link.tsx";

function studySources(study: Study): number[] {
  return mergeSourcePages(
    study.sources,
    study.type.sources,
    study.date?.sources ?? [],
    study.indication?.sources ?? [],
    study.result?.sources ?? [],
  );
}

function microbiologySources(result: MicrobiologyResult): number[] {
  return mergeSourcePages(
    result.sources,
    result.date?.sources ?? [],
    result.sample?.sources ?? [],
    result.organism?.sources ?? [],
    result.result?.sources ?? [],
    result.sensitivity?.sources ?? [],
  );
}

export function ClinicalSummaryView({
  documentId,
  summary,
}: {
  documentId: string;
  summary: ClinicalSummary;
}) {
  const patientFields: RecordFieldSpec[] = [
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
  ];

  const hospitalizationFields: RecordFieldSpec[] = [
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
  ];

  const historyGroups: Array<{
    label: string;
    entries: ClinicalSummary["pathological"];
  }> = [
    { label: clinicalRecord.pathological, entries: summary.pathological },
    { label: clinicalRecord.allergies, entries: summary.allergies },
  ];

  return (
    <section className="flex flex-col gap-6">
      <CollapsibleSection title={clinicalRecord.patient} defaultOpen>
        <RecordFields documentId={documentId} fields={patientFields} />
      </CollapsibleSection>

      <CollapsibleSection title={clinicalRecord.hospitalization} defaultOpen>
        <RecordFields documentId={documentId} fields={hospitalizationFields} />
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {clinicalRecord.diagnoses}
          </h3>
          {summary.diagnoses.length === 0 ? (
            <RecordEmpty />
          ) : (
            <ul className="flex list-none flex-col gap-1">
              {summary.diagnoses.map((diagnosis) => (
                <li
                  key={diagnosis.value}
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
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title={clinicalRecord.history}>
        {historyGroups.every((group) => group.entries.length === 0) ? (
          <RecordEmpty />
        ) : (
          <div className="flex flex-col gap-3">
            {historyGroups.map((group) =>
              group.entries.length > 0 ? (
                <div key={group.label} className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    {group.label}
                  </h3>
                  <ul className="flex list-none flex-col gap-1">
                    {group.entries.map((entry) => (
                      <li
                        key={`${group.label}-${entry.value}`}
                        className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
                      >
                        <span>{displayValue(entry.value)}</span>
                        <EvidenceLinks
                          documentId={documentId}
                          pages={sourcePages(entry.sources)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={summaryLabels.evolution}
        count={summary.evolution.length}
      >
        {summary.evolution.length === 0 ? (
          <RecordEmpty />
        ) : (
          <ul className="flex list-none flex-col gap-2">
            {summary.evolution.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
              >
                <span>
                  {entry.detail.kind === "documented"
                    ? entry.detail.description
                    : (entry.date ?? "")}
                </span>
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
        title={clinicalRecord.studies}
        count={summary.studies.length}
      >
        {summary.studies.length === 0 ? (
          <RecordEmpty />
        ) : (
          <ul className="flex list-none flex-col gap-2">
            {summary.studies.map((study) => (
              <RecordItem
                key={study.type.value}
                documentId={documentId}
                title={displayValue(study.type.value)}
                fields={[
                  {
                    label: clinicalRecord.date,
                    value: study.date?.value,
                    sources: study.date?.sources ?? [],
                  },
                  {
                    label: clinicalRecord.result,
                    value: study.result?.value,
                    sources: study.result?.sources ?? [],
                  },
                ]}
                pages={studySources(study)}
              />
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={clinicalRecord.microbiology}
        count={summary.microbiology.length}
      >
        {summary.microbiology.length === 0 ? (
          <RecordEmpty />
        ) : (
          <ul className="flex list-none flex-col gap-2">
            {summary.microbiology.map((result) => (
              <RecordItem
                key={result.organism?.value ?? result.sample?.value ?? "micro"}
                documentId={documentId}
                title={displayValue(
                  result.organism?.value ?? result.sample?.value,
                )}
                fields={[
                  {
                    label: clinicalRecord.sample,
                    value: result.sample?.value,
                    sources: result.sample?.sources ?? [],
                  },
                  {
                    label: clinicalRecord.result,
                    value: result.result?.value,
                    sources: result.result?.sources ?? [],
                  },
                  {
                    label: clinicalRecord.sensitivity,
                    value: result.sensitivity?.value,
                    sources: result.sensitivity?.sources ?? [],
                  },
                ]}
                pages={microbiologySources(result)}
              />
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={clinicalRecord.treatment}
        count={summary.treatment.length}
      >
        {summary.treatment.length === 0 ? (
          <RecordEmpty />
        ) : (
          <ul className="flex list-none flex-col gap-1">
            {summary.treatment.map((medication, index) => (
              <li
                key={medicationItemKey(medication, index)}
                className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
              >
                <span>{displayValue(medication.name.value)}</span>
                {medication.dose !== undefined ? (
                  <span className="text-muted-foreground">
                    {displayValue(medication.dose.value)}
                  </span>
                ) : null}
                <EvidenceLinks
                  documentId={documentId}
                  pages={sourcePages(medication.sources)}
                />
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      {summary.discharge !== undefined ? (
        <CollapsibleSection title={clinicalRecord.discharge}>
          <RecordFields
            documentId={documentId}
            fields={[
              {
                label: clinicalRecord.conditionAtDischarge,
                value: summary.discharge.conditionAtDischarge?.value,
                sources: summary.discharge.conditionAtDischarge?.sources ?? [],
              },
              {
                label: clinicalRecord.treatment,
                value: summary.discharge.treatment?.value,
                sources: summary.discharge.treatment?.sources ?? [],
              },
              {
                label: clinicalRecord.instructions,
                value: summary.discharge.instructions?.value,
                sources: summary.discharge.instructions?.sources ?? [],
              },
              {
                label: clinicalRecord.followUp,
                value: summary.discharge.followUp?.value,
                sources: summary.discharge.followUp?.sources ?? [],
              },
            ]}
          />
        </CollapsibleSection>
      ) : null}
    </section>
  );
}
