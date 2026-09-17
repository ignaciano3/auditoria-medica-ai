import type { ClinicalRecord, Finding, Source } from "@audit/domain";

function firstSource(record: ClinicalRecord): Source | undefined {
  for (const value of Object.values(record.patient)) {
    if (value?.sources[0] !== undefined) return value.sources[0];
  }
  for (const value of Object.values(record.hospitalization)) {
    if (Array.isArray(value)) {
      const first = value.find((item) => item?.sources?.[0] !== undefined);
      if (first?.sources[0] !== undefined) return first.sources[0];
    } else if (value?.sources?.[0] !== undefined) {
      return value.sources[0];
    }
  }
  for (const medication of record.medications) {
    if (medication.sources[0] !== undefined) return medication.sources[0];
  }
  for (const lab of record.laboratory) {
    if (lab.sources[0] !== undefined) return lab.sources[0];
  }
  for (const allergy of record.history.allergies) {
    if (allergy.sources[0] !== undefined) return allergy.sources[0];
  }
  return undefined;
}

function finding(
  id: string,
  severity: Finding["severity"],
  category: Finding["category"],
  title: string,
  explanation: string,
  source: Source,
  recommendation?: string,
): Finding {
  return {
    id,
    severity,
    category,
    title,
    explanation,
    evidence: [{ source, relevance: explanation }],
    ...(recommendation !== undefined ? { recommendation } : {}),
    requiresHumanReview: true,
  };
}

export function analyzeClinicalRecordHeuristically(
  record: ClinicalRecord,
): Finding[] {
  const findings: Finding[] = [];
  const source = firstSource(record);
  if (source === undefined) return findings;

  for (const medication of record.medications) {
    if (medication.dose !== undefined) continue;
    const medicationSource = medication.sources[0] ?? source;
    findings.push(
      finding(
        `heuristic-medication-no-dose-${findings.length + 1}`,
        "medium",
        "medication",
        `Medicación "${medication.name.value}" sin dosis registrada`,
        "La medicación no indica la dosis administrada.",
        medicationSource,
        "Completar la dosis en el registro clínico.",
      ),
    );
  }

  if (record.hospitalization.dischargeDate === undefined) {
    findings.push(
      finding(
        `heuristic-no-discharge-date-${findings.length + 1}`,
        "medium",
        "temporal",
        "Registro sin fecha de alta",
        "No se encontró fecha de alta en el registro hospitalario.",
        source,
        "Confirmar si el paciente continúa internado o completar la fecha de alta.",
      ),
    );
  }

  if (record.patient.name === undefined) {
    findings.push(
      finding(
        `heuristic-no-patient-name-${findings.length + 1}`,
        "medium",
        "documentation",
        "Paciente sin identificación",
        "No se pudo extraer el nombre del paciente del registro.",
        source,
        "Verificar la identificación del paciente en el documento original.",
      ),
    );
  }

  if (record.hospitalization.diagnoses.length === 0) {
    findings.push(
      finding(
        `heuristic-no-diagnoses-${findings.length + 1}`,
        "low",
        "documentation",
        "Registro sin diagnósticos",
        "No se encontraron diagnósticos registrados en el documento.",
        source,
      ),
    );
  }

  return findings;
}
