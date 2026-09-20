import type {
  ClinicalRecord,
  ExtractedValue,
  Hospitalization,
  LabResult,
  MedicalHistory,
  Medication,
  MicrobiologyResult,
  Source,
  Study,
} from "@audit/domain";
import { clinicalRecord, medicationStatusLabels } from "@audit/lib/i18n";
import {
  dateConflictItemKey,
  displayValue,
  foldText,
  groupMedications,
  historyEntryItemKey,
  labResultItemKey,
  medicationGroupItemKey,
  mergeSourcePages,
  microbiologyItemKey,
  sourcePages,
  studyItemKey,
} from "../lib/clinical-record-view.ts";
import {
  CollapsibleSection,
  RecordEmpty,
  type RecordFieldSpec,
  RecordFields,
  RecordItem,
  RecordValue,
} from "./clinical-record-primitives.tsx";
import { EvidenceLinks } from "./evidence-link.tsx";

function hasValue(value: string | number | undefined): boolean {
  return displayValue(value) !== undefined;
}

function DateConflicts({
  documentId,
  label,
  conflicts,
}: {
  documentId: string;
  label: string;
  conflicts: ExtractedValue<string>[];
}) {
  if (conflicts.length === 0) return null;

  return (
    <div
      className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning"
      role="alert"
    >
      <p className="font-semibold">{label}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {conflicts.map((conflict, index) => (
          <li
            key={dateConflictItemKey(conflict.value, index)}
            className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
          >
            <RecordValue value={conflict.value} />
            <EvidenceLinks
              documentId={documentId}
              pages={sourcePages(conflict.sources)}
            />
          </li>
        ))}
      </ul>
      <p className="mt-1">{clinicalRecord.dateConflictNote}</p>
    </div>
  );
}

export function HospitalizationSection({
  documentId,
  hospitalization,
}: {
  documentId: string;
  hospitalization: Hospitalization;
}) {
  const { dischargeDiagnosis, admissionDateConflicts, dischargeDateConflicts } =
    hospitalization;

  const fields: RecordFieldSpec[] = [
    {
      label: clinicalRecord.dischargeDiagnosis,
      value: dischargeDiagnosis?.value,
      sources: dischargeDiagnosis?.sources ?? [],
    },
  ];

  return (
    <CollapsibleSection title={clinicalRecord.hospitalization}>
      {fields.some((field) => hasValue(field.value)) ? (
        <RecordFields documentId={documentId} fields={fields} />
      ) : (
        <RecordEmpty />
      )}
      <DateConflicts
        documentId={documentId}
        label={clinicalRecord.admissionDateConflicts}
        conflicts={admissionDateConflicts ?? []}
      />
      <DateConflicts
        documentId={documentId}
        label={clinicalRecord.dischargeDateConflicts}
        conflicts={dischargeDateConflicts ?? []}
      />
    </CollapsibleSection>
  );
}

function collectMedicationField(
  group: Medication[],
  pick: (medication: Medication) => ExtractedValue<string> | undefined,
): { value: string | undefined; sources: Source[] } {
  const values: string[] = [];
  const seen = new Set<string>();
  const sources: Source[] = [];

  for (const medication of group) {
    const field = pick(medication);
    if (field === undefined) continue;
    sources.push(...field.sources);
    const text = displayValue(field.value);
    if (text === undefined) continue;
    const key = foldText(text) ?? text;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(text);
  }

  return {
    value: values.length > 0 ? values.join(" / ") : undefined,
    sources,
  };
}

function collectMedicationStatus(group: Medication[]): string | undefined {
  const values: string[] = [];
  const seen = new Set<string>();

  for (const medication of group) {
    if (medication.status === undefined) continue;
    const label = medicationStatusLabels[medication.status];
    const key = foldText(label) ?? label;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(label);
  }

  return values.length > 0 ? values.join(" / ") : undefined;
}

function medicationGroupFields(group: Medication[]): RecordFieldSpec[] {
  const dose = collectMedicationField(group, (medication) => medication.dose);
  const route = collectMedicationField(group, (medication) => medication.route);
  const frequency = collectMedicationField(
    group,
    (medication) => medication.frequency,
  );
  const startDate = collectMedicationField(
    group,
    (medication) => medication.startDate,
  );
  const endDate = collectMedicationField(
    group,
    (medication) => medication.endDate,
  );

  return [
    { label: clinicalRecord.dose, value: dose.value, sources: dose.sources },
    {
      label: clinicalRecord.route,
      value: route.value,
      sources: route.sources,
    },
    {
      label: clinicalRecord.frequency,
      value: frequency.value,
      sources: frequency.sources,
    },
    {
      label: clinicalRecord.startDate,
      value: startDate.value,
      sources: startDate.sources,
    },
    {
      label: clinicalRecord.endDate,
      value: endDate.value,
      sources: endDate.sources,
    },
    {
      label: clinicalRecord.status,
      value: collectMedicationStatus(group),
      sources: [],
    },
  ];
}

function medicationSources(medication: Medication): number[] {
  return mergeSourcePages(
    medication.sources,
    medication.name.sources,
    medication.dose?.sources ?? [],
    medication.route?.sources ?? [],
    medication.frequency?.sources ?? [],
    medication.startDate?.sources ?? [],
    medication.endDate?.sources ?? [],
  );
}

function medicationGroupSources(group: Medication[]): number[] {
  const pages = new Set<number>();
  for (const medication of group) {
    for (const page of medicationSources(medication)) {
      pages.add(page);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

function medicationGroupName(group: Medication[]): string | undefined {
  for (const medication of group) {
    const name = displayValue(medication.name.value);
    if (name !== undefined) return name;
  }
  return undefined;
}

function MedicationItem({
  documentId,
  group,
}: {
  documentId: string;
  group: Medication[];
}) {
  return (
    <RecordItem
      documentId={documentId}
      title={medicationGroupName(group)}
      fields={medicationGroupFields(group)}
      pages={medicationGroupSources(group)}
    />
  );
}

export function HistorySection({
  documentId,
  history,
}: {
  documentId: string;
  history: MedicalHistory;
}) {
  const groups: Array<{ label: string; entries: ExtractedValue<string>[] }> = [
    { label: clinicalRecord.pathological, entries: history.pathological },
    { label: clinicalRecord.allergies, entries: history.allergies },
  ];
  const hasAny =
    history.pathological.length > 0 ||
    history.allergies.length > 0 ||
    history.usualMedications.length > 0;

  return (
    <CollapsibleSection title={clinicalRecord.history}>
      {hasAny ? (
        <div className="flex flex-col gap-3">
          {groups.map((group) =>
            group.entries.length > 0 ? (
              <div key={group.label} className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {group.label}
                </h3>
                <ul className="flex list-none flex-col gap-1">
                  {group.entries.map((entry, index) => (
                    <li
                      key={historyEntryItemKey(group.label, entry.value, index)}
                      className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
                    >
                      <RecordValue value={entry.value} />
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
          {history.usualMedications.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {clinicalRecord.usualMedications}
              </h3>
              <ul className="flex list-none flex-col gap-2">
                {groupMedications(history.usualMedications).map(
                  (group, index) => (
                    <MedicationItem
                      key={medicationGroupItemKey(group, index)}
                      documentId={documentId}
                      group={group.medications}
                    />
                  ),
                )}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <RecordEmpty />
      )}
    </CollapsibleSection>
  );
}

export function MedicationsSection({
  documentId,
  medications,
}: {
  documentId: string;
  medications: Medication[];
}) {
  const groups = groupMedications(medications);

  return (
    <CollapsibleSection
      title={clinicalRecord.medications}
      count={groups.length}
    >
      {groups.length === 0 ? (
        <RecordEmpty />
      ) : (
        <ul className="grid list-none grid-cols-2 items-start gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {groups.map((group, index) => (
            <MedicationItem
              key={medicationGroupItemKey(group, index)}
              documentId={documentId}
              group={group.medications}
            />
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

function labSources(result: LabResult): number[] {
  return mergeSourcePages(
    result.sources,
    result.name.sources,
    result.value.sources,
    result.date?.sources ?? [],
    result.unit?.sources ?? [],
    result.referenceRange?.sources ?? [],
  );
}

export function LaboratorySection({
  documentId,
  laboratory,
}: {
  documentId: string;
  laboratory: LabResult[];
}) {
  return (
    <CollapsibleSection
      title={clinicalRecord.laboratory}
      count={laboratory.length}
    >
      {laboratory.length === 0 ? (
        <RecordEmpty />
      ) : (
        <ul className="grid list-none grid-cols-2 items-start gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {laboratory.map((result, index) => (
            <RecordItem
              key={labResultItemKey(result, index)}
              documentId={documentId}
              title={displayValue(result.name.value)}
              fields={[
                {
                  label: clinicalRecord.date,
                  value: result.date?.value,
                  sources: result.date?.sources ?? [],
                },
                {
                  label: clinicalRecord.value,
                  value: result.value.value,
                  sources: result.value.sources,
                },
                {
                  label: clinicalRecord.unit,
                  value: result.unit?.value,
                  sources: result.unit?.sources ?? [],
                },
                {
                  label: clinicalRecord.referenceRange,
                  value: result.referenceRange?.value,
                  sources: result.referenceRange?.sources ?? [],
                },
              ]}
              pages={labSources(result)}
            />
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

function studySources(study: Study): number[] {
  return mergeSourcePages(
    study.sources,
    study.type.sources,
    study.date?.sources ?? [],
    study.indication?.sources ?? [],
    study.result?.sources ?? [],
  );
}

export function StudiesSection({
  documentId,
  studies,
}: {
  documentId: string;
  studies: Study[];
}) {
  return (
    <CollapsibleSection title={clinicalRecord.studies} count={studies.length}>
      {studies.length === 0 ? (
        <RecordEmpty />
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {studies.map((study, index) => (
            <RecordItem
              key={studyItemKey(study, index)}
              documentId={documentId}
              title={displayValue(study.type.value)}
              fields={[
                {
                  label: clinicalRecord.date,
                  value: study.date?.value,
                  sources: study.date?.sources ?? [],
                },
                {
                  label: clinicalRecord.indication,
                  value: study.indication?.value,
                  sources: study.indication?.sources ?? [],
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

export function MicrobiologySection({
  documentId,
  microbiology,
}: {
  documentId: string;
  microbiology: MicrobiologyResult[];
}) {
  return (
    <CollapsibleSection
      title={clinicalRecord.microbiology}
      count={microbiology.length}
    >
      {microbiology.length === 0 ? (
        <RecordEmpty />
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {microbiology.map((result, index) => (
            <RecordItem
              key={microbiologyItemKey(result, index)}
              documentId={documentId}
              title={displayValue(
                result.organism?.value ?? result.sample?.value,
              )}
              fields={[
                {
                  label: clinicalRecord.date,
                  value: result.date?.value,
                  sources: result.date?.sources ?? [],
                },
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
  );
}

export function DischargeSection({
  documentId,
  discharge,
}: {
  documentId: string;
  discharge: ClinicalRecord["discharge"];
}) {
  const fields: RecordFieldSpec[] = [
    {
      label: clinicalRecord.date,
      value: discharge?.date?.value,
      sources: discharge?.date?.sources ?? [],
    },
    {
      label: clinicalRecord.conditionAtDischarge,
      value: discharge?.conditionAtDischarge?.value,
      sources: discharge?.conditionAtDischarge?.sources ?? [],
    },
    {
      label: clinicalRecord.dischargeDiagnosis,
      value: discharge?.diagnosis?.value,
      sources: discharge?.diagnosis?.sources ?? [],
    },
    {
      label: clinicalRecord.treatment,
      value: discharge?.treatment?.value,
      sources: discharge?.treatment?.sources ?? [],
    },
    {
      label: clinicalRecord.instructions,
      value: discharge?.instructions?.value,
      sources: discharge?.instructions?.sources ?? [],
    },
    {
      label: clinicalRecord.warningSigns,
      value: discharge?.warningSigns?.value,
      sources: discharge?.warningSigns?.sources ?? [],
    },
    {
      label: clinicalRecord.followUp,
      value: discharge?.followUp?.value,
      sources: discharge?.followUp?.sources ?? [],
    },
  ];

  return (
    <CollapsibleSection title={clinicalRecord.discharge}>
      {fields.some((field) => hasValue(field.value)) ? (
        <RecordFields documentId={documentId} fields={fields} />
      ) : (
        <RecordEmpty />
      )}
    </CollapsibleSection>
  );
}
