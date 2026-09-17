import type { ClinicalRecord, DocumentPage, Finding } from "@audit/domain";
import type { LLMProvider } from "../../llm-provider.ts";
import { analyzeClinicalRecordHeuristically } from "./heuristic-analyze.ts";
import { extractClinicalRecordFromPages } from "./heuristic-extract.ts";

function formatValue<T>(
  value: { value: T } | undefined,
  fallback = "—",
): string {
  return value === undefined ? fallback : String(value.value);
}

function formatSex(sex: string | undefined): string {
  if (sex === undefined) return "";
  return `, sexo ${sex}`;
}

export class HeuristicLLMProvider implements LLMProvider {
  async extractClinicalRecord(pages: DocumentPage[]): Promise<ClinicalRecord> {
    return extractClinicalRecordFromPages(pages);
  }

  async analyzeClinicalRecord(record: ClinicalRecord): Promise<Finding[]> {
    return analyzeClinicalRecordHeuristically(record);
  }

  async generateClinicalSummary(record: ClinicalRecord): Promise<string> {
    const name = formatValue(record.patient.name);
    const age = formatValue(record.patient.age);
    const admission = formatValue(record.hospitalization.admissionDate);
    const discharge = formatValue(record.hospitalization.dischargeDate);
    const diagnoses = record.hospitalization.diagnoses
      .map((diagnosis) => diagnosis.value)
      .join(", ");
    return [
      `Resumen clínico`,
      `Paciente: ${name}, ${age} años${formatSex(record.patient.sex?.value)}`,
      `Ingreso: ${admission} — Alta: ${discharge}`,
      `Diagnósticos: ${diagnoses === "" ? "—" : diagnoses}`,
    ].join("\n");
  }

  async generateAuditSummary(
    record: ClinicalRecord,
    findings: Finding[],
  ): Promise<string> {
    const name = formatValue(record.patient.name);
    const lines = [`Resumen de auditoría`, `Paciente: ${name}`];
    if (findings.length === 0) {
      lines.push("No se detectaron hallazgos por heurística.");
    } else {
      lines.push(`Hallazgos detectados: ${findings.length}`);
      for (const item of findings) {
        lines.push(`- [${item.severity}] ${item.title}`);
      }
    }
    return lines.join("\n");
  }
}
