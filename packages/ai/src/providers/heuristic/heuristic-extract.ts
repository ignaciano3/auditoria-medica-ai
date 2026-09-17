import type {
  ClinicalRecord,
  DocumentPage,
  ExtractedValue,
  LabResult,
  Medication,
  Source,
} from "@audit/domain";

function sourceFor(page: DocumentPage): Source {
  return { documentId: "", pageNumber: page.pageNumber, text: page.text };
}

function ev<T>(value: T, source: Source): ExtractedValue<T> {
  return { value, sources: [source] };
}

function textOf(pages: readonly DocumentPage[]): string {
  return pages.map((page) => page.text).join("\n");
}

function matchFirst(pattern: RegExp, text: string): string | undefined {
  return text.match(pattern)?.[1]?.trim();
}

const NAME_PATTERN =
  /(?:paciente|nombre)\s*[:•-]?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,4})/i;

const AGE_PATTERN = /(\d{1,3})\s*(?:años?)\b/i;

const SEX_PATTERN = /\b(masculino|femenino)\b/i;

const ADMISSION_DATE_PATTERN =
  /(?:fecha de ingreso|ingreso)\s*[:•-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i;

const DISCHARGE_DATE_PATTERN =
  /(?:fecha de alta|alta|egreso)\s*[:•-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i;

const DIAGNOSES_PATTERN = /(?:diagn[oó]stic[oó]s?)\s*[:•-]?\s*([^\n]+)/i;

const ALLERGIES_PATTERN = /alergi[a-z]*\s*[:•-]?\s*([^\n.]+)/i;

const MEDICATION_PATTERN =
  /^\s*(?:[-•*\d.)]+\s+)?([A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}){0,3})\s+(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|ml|UI)\b/gim;

const LAB_PATTERN =
  /(hemograma|glucosa|creatinina|urea|uremia|glicemia|sodio|potasio|hematocrito|hemoglobina|leucocitos|plaquetas)\s*[:=]?\s*([\d.,]+)\s*(mg\/dl|g\/dl|g%|u\/l|mmol\/l|%|mcg\/dl|meq\/l)?/gi;

export function extractClinicalRecordFromPages(
  pages: readonly DocumentPage[],
): ClinicalRecord {
  const text = textOf(pages);
  const [firstPage] = pages;
  const source = firstPage === undefined ? undefined : sourceFor(firstPage);

  const medications: Medication[] = [];
  for (const match of text.matchAll(MEDICATION_PATTERN)) {
    if (source === undefined) continue;
    const [, name, doseValue, unit] = match;
    if (name === undefined || doseValue === undefined || unit === undefined) {
      continue;
    }
    medications.push({
      name: ev(name, source),
      dose: ev(`${doseValue} ${unit}`, source),
      sources: [source],
    });
  }

  const labResults: LabResult[] = [];
  for (const match of text.matchAll(LAB_PATTERN)) {
    if (source === undefined) continue;
    const [, name, value, unit] = match;
    if (name === undefined || value === undefined) continue;
    labResults.push({
      name: ev(name, source),
      value: ev(value, source),
      ...(unit !== undefined ? { unit: ev(unit, source) } : {}),
      sources: [source],
    });
  }

  const diagnoses =
    (source !== undefined
      ? matchFirst(DIAGNOSES_PATTERN, text)
          ?.split(/[,;]/)
          .map((entry) => entry.trim().replace(/[.;,]+$/, ""))
          .filter((entry) => entry.length > 0)
          .map((entry) => ev(entry, source))
      : undefined) ?? [];

  const allergies =
    (source !== undefined
      ? matchFirst(ALLERGIES_PATTERN, text)
          ?.split(/[,;]/)
          .map((entry) => entry.trim().replace(/[.;,]+$/, ""))
          .filter((entry) => entry.length > 0)
          .map((entry) => ev(entry, source))
      : undefined) ?? [];

  const admissionDate = matchFirst(ADMISSION_DATE_PATTERN, text);
  const dischargeDate = matchFirst(DISCHARGE_DATE_PATTERN, text);
  const name = matchFirst(NAME_PATTERN, text);
  const age = matchFirst(AGE_PATTERN, text);
  const sex = matchFirst(SEX_PATTERN, text);

  return {
    patient: {
      ...(name !== undefined && source !== undefined
        ? { name: ev(name, source) }
        : {}),
      ...(age !== undefined && source !== undefined
        ? { age: ev(Number.parseInt(age, 10), source) }
        : {}),
      ...(sex !== undefined && source !== undefined
        ? { sex: ev(sex, source) }
        : {}),
    },
    hospitalization: {
      ...(admissionDate !== undefined && source !== undefined
        ? { admissionDate: ev(admissionDate, source) }
        : {}),
      ...(dischargeDate !== undefined && source !== undefined
        ? { dischargeDate: ev(dischargeDate, source) }
        : {}),
      diagnoses,
      admissionDateConflicts: [],
      dischargeDateConflicts: [],
    },
    history: {
      pathological: [],
      allergies,
      usualMedications: [],
    },
    medications,
    laboratory: labResults,
    studies: [],
    microbiology: [],
    clinicalEvents: [],
  };
}
