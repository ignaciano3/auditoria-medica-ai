import type {
  ClinicalEvent,
  ClinicalRecord,
  DischargeInformation,
  ExtractedValue,
  Hospitalization,
  LabResult,
  Medication,
  MicrobiologyResult,
  Patient,
  Source,
  Study,
} from "@audit/domain";

type SourceBearing = { sources: Source[] };

function normalize(value: unknown): string {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function sourceKey(source: Source): string {
  return `${source.documentId}#${source.pageNumber}`;
}

function hasContent(item: ExtractedValue<unknown>): boolean {
  return normalize(item.value) !== "";
}

function unionSources(lists: readonly (readonly Source[])[]): Source[] {
  const seen = new Set<string>();
  const merged: Source[] = [];
  for (const list of lists) {
    for (const source of list) {
      const key = sourceKey(source);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(source);
    }
  }
  return merged;
}

function mergeArrays<T extends SourceBearing>(
  records: readonly ClinicalRecord[],
  select: (record: ClinicalRecord) => readonly T[],
  keyOf: (item: T) => string,
): T[] {
  const order: string[] = [];
  const entries = new Map<string, { item: T; sourceLists: Source[][] }>();
  for (const record of records) {
    for (const item of select(record)) {
      const key = keyOf(item);
      const entry = entries.get(key);
      if (entry !== undefined) {
        entry.sourceLists.push(item.sources);
      } else {
        order.push(key);
        entries.set(key, { item, sourceLists: [item.sources] });
      }
    }
  }
  return order.map((key) => {
    const entry = entries.get(key);
    if (entry === undefined) throw new Error("unreachable");
    return { ...entry.item, sources: unionSources(entry.sourceLists) };
  });
}

function mergeSingular<T>(
  records: readonly ClinicalRecord[],
  select: (record: ClinicalRecord) => ExtractedValue<T> | undefined,
): ExtractedValue<T> | undefined {
  let merged: ExtractedValue<T> | undefined;
  for (const record of records) {
    const item = select(record);
    if (item === undefined || !hasContent(item)) continue;
    if (merged === undefined) {
      merged = { ...item, sources: [...item.sources] };
      continue;
    }
    if (normalize(merged.value) === normalize(item.value)) {
      merged = {
        ...merged,
        sources: unionSources([merged.sources, item.sources]),
      };
    }
  }
  return merged;
}

type MergedDate = {
  value?: ExtractedValue<string>;
  conflicts: ExtractedValue<string>[];
};

function mergeDateField(
  records: readonly ClinicalRecord[],
  select: (record: ClinicalRecord) => ExtractedValue<string> | undefined,
): MergedDate {
  const order: string[] = [];
  const entries = new Map<
    string,
    { item: ExtractedValue<string>; sourceLists: Source[][] }
  >();
  for (const record of records) {
    const item = select(record);
    if (item === undefined || !hasContent(item)) continue;
    const key = normalize(item.value);
    const entry = entries.get(key);
    if (entry !== undefined) {
      entry.sourceLists.push(item.sources);
    } else {
      order.push(key);
      entries.set(key, { item, sourceLists: [item.sources] });
    }
  }
  const variants = order.map((key) => {
    const entry = entries.get(key);
    if (entry === undefined) throw new Error("unreachable");
    return { ...entry.item, sources: unionSources(entry.sourceLists) };
  });
  const [first] = variants;
  if (first === undefined) return { conflicts: [] };
  if (variants.length > 1) return { value: first, conflicts: variants };
  return { value: first, conflicts: [] };
}

function extractedKey(item: ExtractedValue<string>): string {
  return normalize(item.value);
}

function optionalKey(item: ExtractedValue<string> | undefined): string {
  return item === undefined ? "" : normalize(item.value);
}

function medicationKey(item: Medication): string {
  return [
    normalize(item.name.value),
    optionalKey(item.dose),
    optionalKey(item.route),
    optionalKey(item.frequency),
    optionalKey(item.startDate),
    optionalKey(item.endDate),
    item.status ?? "",
  ].join("|");
}

function labResultKey(item: LabResult): string {
  return [
    optionalKey(item.date),
    normalize(item.name.value),
    normalize(item.value.value),
    optionalKey(item.unit),
    optionalKey(item.referenceRange),
  ].join("|");
}

function studyKey(item: Study): string {
  return [
    optionalKey(item.date),
    normalize(item.type.value),
    optionalKey(item.indication),
    optionalKey(item.result),
  ].join("|");
}

function microbiologyKey(item: MicrobiologyResult): string {
  return [
    optionalKey(item.date),
    optionalKey(item.sample),
    optionalKey(item.organism),
    optionalKey(item.result),
    optionalKey(item.sensitivity),
  ].join("|");
}

function clinicalEventKey(item: ClinicalEvent): string {
  return [
    normalize(item.date ?? ""),
    normalize(item.type),
    normalize(item.description),
  ].join("|");
}

function mergePatient(records: readonly ClinicalRecord[]): Patient {
  const patient: Patient = {};
  const name = mergeSingular(records, (record) => record.patient.name);
  if (name !== undefined) patient.name = name;
  const age = mergeSingular(records, (record) => record.patient.age);
  if (age !== undefined) patient.age = age;
  const sex = mergeSingular(records, (record) => record.patient.sex);
  if (sex !== undefined) patient.sex = sex;
  const birthDate = mergeSingular(
    records,
    (record) => record.patient.birthDate,
  );
  if (birthDate !== undefined) patient.birthDate = birthDate;
  return patient;
}

function mergeDischarge(
  records: readonly ClinicalRecord[],
): DischargeInformation | undefined {
  if (!records.some((record) => record.discharge !== undefined)) {
    return undefined;
  }
  const discharge: DischargeInformation = {};
  const date = mergeSingular(records, (record) => record.discharge?.date);
  if (date !== undefined) discharge.date = date;
  const conditionAtDischarge = mergeSingular(
    records,
    (record) => record.discharge?.conditionAtDischarge,
  );
  if (conditionAtDischarge !== undefined) {
    discharge.conditionAtDischarge = conditionAtDischarge;
  }
  const diagnosis = mergeSingular(
    records,
    (record) => record.discharge?.diagnosis,
  );
  if (diagnosis !== undefined) discharge.diagnosis = diagnosis;
  const treatment = mergeSingular(
    records,
    (record) => record.discharge?.treatment,
  );
  if (treatment !== undefined) discharge.treatment = treatment;
  const instructions = mergeSingular(
    records,
    (record) => record.discharge?.instructions,
  );
  if (instructions !== undefined) discharge.instructions = instructions;
  const warningSigns = mergeSingular(
    records,
    (record) => record.discharge?.warningSigns,
  );
  if (warningSigns !== undefined) discharge.warningSigns = warningSigns;
  const followUp = mergeSingular(
    records,
    (record) => record.discharge?.followUp,
  );
  if (followUp !== undefined) discharge.followUp = followUp;
  return discharge;
}

function mergeHospitalization(
  records: readonly ClinicalRecord[],
): Hospitalization {
  const hospitalization: Hospitalization = {
    diagnoses: mergeArrays(
      records,
      (record) => record.hospitalization.diagnoses,
      extractedKey,
    ),
  };
  const reason = mergeSingular(
    records,
    (record) => record.hospitalization.reason,
  );
  if (reason !== undefined) hospitalization.reason = reason;
  const dischargeDiagnosis = mergeSingular(
    records,
    (record) => record.hospitalization.dischargeDiagnosis,
  );
  if (dischargeDiagnosis !== undefined) {
    hospitalization.dischargeDiagnosis = dischargeDiagnosis;
  }
  const admissionDate = mergeDateField(
    records,
    (record) => record.hospitalization.admissionDate,
  );
  if (admissionDate.value !== undefined) {
    hospitalization.admissionDate = admissionDate.value;
  }
  hospitalization.admissionDateConflicts = admissionDate.conflicts;
  const dischargeDate = mergeDateField(
    records,
    (record) => record.hospitalization.dischargeDate,
  );
  if (dischargeDate.value !== undefined) {
    hospitalization.dischargeDate = dischargeDate.value;
  }
  hospitalization.dischargeDateConflicts = dischargeDate.conflicts;
  return hospitalization;
}

export function reduceRecords(
  records: readonly ClinicalRecord[],
): ClinicalRecord {
  const record: ClinicalRecord = {
    patient: mergePatient(records),
    hospitalization: mergeHospitalization(records),
    history: {
      pathological: mergeArrays(
        records,
        (source) => source.history.pathological,
        extractedKey,
      ),
      allergies: mergeArrays(
        records,
        (source) => source.history.allergies,
        extractedKey,
      ),
      usualMedications: mergeArrays(
        records,
        (source) => source.history.usualMedications,
        medicationKey,
      ),
    },
    medications: mergeArrays(
      records,
      (source) => source.medications,
      medicationKey,
    ),
    laboratory: mergeArrays(
      records,
      (source) => source.laboratory,
      labResultKey,
    ),
    studies: mergeArrays(records, (source) => source.studies, studyKey),
    microbiology: mergeArrays(
      records,
      (source) => source.microbiology,
      microbiologyKey,
    ),
    clinicalEvents: mergeArrays(
      records,
      (source) => source.clinicalEvents,
      clinicalEventKey,
    ),
  };
  const discharge = mergeDischarge(records);
  if (discharge !== undefined) record.discharge = discharge;
  return record;
}
