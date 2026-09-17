import { describe, expect, test } from "bun:test";
import type {
  ClinicalEvent,
  ClinicalRecord,
  DischargeInformation,
  Evidence,
  ExtractedValue,
  Finding,
  Hospitalization,
  LabResult,
  MedicalHistory,
  Medication,
  MicrobiologyResult,
  Patient,
  Source,
  Study,
} from "@audit/domain";
import {
  type clinicalEventSchema,
  clinicalRecordSchema,
  type dischargeSchema,
  type evidenceSchema,
  extractedValueSchema,
  type findingSchema,
  type historySchema,
  type hospitalizationSchema,
  type labResultSchema,
  type medicationSchema,
  type microbiologyResultSchema,
  type patientSchema,
  sourceSchema,
  type studySchema,
} from "@audit/domain";
import { z } from "zod";

type IsAssignable<From, To> = [From] extends [To] ? true : false;

const stringValueSchema = extractedValueSchema(z.string());

type SourceInferred = z.output<typeof sourceSchema>;
type SourceInput = z.input<typeof sourceSchema>;
type StringValueInferred = z.output<typeof stringValueSchema>;
type StringValueInput = z.input<typeof stringValueSchema>;
type EvidenceInferred = z.output<typeof evidenceSchema>;
type EvidenceInput = z.input<typeof evidenceSchema>;
type PatientInferred = z.output<typeof patientSchema>;
type PatientInput = z.input<typeof patientSchema>;
type MedicationInferred = z.output<typeof medicationSchema>;
type MedicationInput = z.input<typeof medicationSchema>;
type LabResultInferred = z.output<typeof labResultSchema>;
type LabResultInput = z.input<typeof labResultSchema>;
type StudyInferred = z.output<typeof studySchema>;
type StudyInput = z.input<typeof studySchema>;
type MicrobiologyResultInferred = z.output<typeof microbiologyResultSchema>;
type MicrobiologyResultInput = z.input<typeof microbiologyResultSchema>;
type ClinicalEventInferred = z.output<typeof clinicalEventSchema>;
type ClinicalEventInput = z.input<typeof clinicalEventSchema>;
type DischargeInferred = z.output<typeof dischargeSchema>;
type DischargeInput = z.input<typeof dischargeSchema>;
type HospitalizationInferred = z.output<typeof hospitalizationSchema>;
type HospitalizationInput = z.input<typeof hospitalizationSchema>;
type HistoryInferred = z.output<typeof historySchema>;
type HistoryInput = z.input<typeof historySchema>;
type ClinicalRecordInferred = z.output<typeof clinicalRecordSchema>;
type ClinicalRecordInput = z.input<typeof clinicalRecordSchema>;
type FindingInferred = z.output<typeof findingSchema>;
type FindingInput = z.input<typeof findingSchema>;

describe("schema/type parity", () => {
  test("every domain type is assignable to its schema input type", () => {
    const sourceInput: IsAssignable<Source, SourceInput> = true;
    const stringValueInput: IsAssignable<
      ExtractedValue<string>,
      StringValueInput
    > = true;
    const evidenceInput: IsAssignable<Evidence, EvidenceInput> = true;
    const patientInput: IsAssignable<Patient, PatientInput> = true;
    const medicationInput: IsAssignable<Medication, MedicationInput> = true;
    const labResultInput: IsAssignable<LabResult, LabResultInput> = true;
    const studyInput: IsAssignable<Study, StudyInput> = true;
    const microbiologyInput: IsAssignable<
      MicrobiologyResult,
      MicrobiologyResultInput
    > = true;
    const clinicalEventInput: IsAssignable<ClinicalEvent, ClinicalEventInput> =
      true;
    const dischargeInput: IsAssignable<DischargeInformation, DischargeInput> =
      true;
    const hospitalizationInput: IsAssignable<
      Hospitalization,
      HospitalizationInput
    > = true;
    const historyInput: IsAssignable<MedicalHistory, HistoryInput> = true;
    const clinicalRecordInput: IsAssignable<
      ClinicalRecord,
      ClinicalRecordInput
    > = true;
    const findingInput: IsAssignable<Finding, FindingInput> = true;

    expect([
      sourceInput,
      stringValueInput,
      evidenceInput,
      patientInput,
      medicationInput,
      labResultInput,
      studyInput,
      microbiologyInput,
      clinicalEventInput,
      dischargeInput,
      hospitalizationInput,
      historyInput,
      clinicalRecordInput,
      findingInput,
    ]).toEqual(Array.from({ length: 14 }, () => true));
  });

  test("domain types without schema defaults match the schema output type", () => {
    const sourceOutput: IsAssignable<Source, SourceInferred> = true;
    const stringValueOutput: IsAssignable<
      ExtractedValue<string>,
      StringValueInferred
    > = true;
    const evidenceOutput: IsAssignable<Evidence, EvidenceInferred> = true;
    const patientOutput: IsAssignable<Patient, PatientInferred> = true;
    const medicationOutput: IsAssignable<Medication, MedicationInferred> = true;
    const labResultOutput: IsAssignable<LabResult, LabResultInferred> = true;
    const studyOutput: IsAssignable<Study, StudyInferred> = true;
    const microbiologyOutput: IsAssignable<
      MicrobiologyResult,
      MicrobiologyResultInferred
    > = true;
    const clinicalEventOutput: IsAssignable<
      ClinicalEvent,
      ClinicalEventInferred
    > = true;
    const dischargeOutput: IsAssignable<
      DischargeInformation,
      DischargeInferred
    > = true;
    const historyOutput: IsAssignable<MedicalHistory, HistoryInferred> = true;
    const findingOutput: IsAssignable<Finding, FindingInferred> = true;

    expect([
      sourceOutput,
      stringValueOutput,
      evidenceOutput,
      patientOutput,
      medicationOutput,
      labResultOutput,
      studyOutput,
      microbiologyOutput,
      clinicalEventOutput,
      dischargeOutput,
      historyOutput,
      findingOutput,
    ]).toEqual(Array.from({ length: 12 }, () => true));
  });

  test("records the known defaults and exactOptionalPropertyTypes gaps", () => {
    const hospitalizationOutput: IsAssignable<
      Hospitalization,
      HospitalizationInferred
    > = false;
    const clinicalRecordOutput: IsAssignable<
      ClinicalRecord,
      ClinicalRecordInferred
    > = false;
    const sourceReverseOutput: IsAssignable<SourceInferred, Source> = false;
    const medicationReverseOutput: IsAssignable<
      MedicationInferred,
      Medication
    > = false;
    const clinicalRecordReverseOutput: IsAssignable<
      ClinicalRecordInferred,
      ClinicalRecord
    > = false;
    const findingReverseOutput: IsAssignable<FindingInferred, Finding> = false;

    expect([
      hospitalizationOutput,
      clinicalRecordOutput,
      sourceReverseOutput,
      medicationReverseOutput,
      clinicalRecordReverseOutput,
      findingReverseOutput,
    ]).toEqual(Array.from({ length: 6 }, () => false));
  });

  test("parses the minimal domain shape through the schemas", () => {
    const source: Source = { documentId: "doc", pageNumber: 1, text: "texto" };
    expect(sourceSchema.parse(source)).toEqual(source);
    const record = clinicalRecordSchema.parse({});
    expect(record.patient).toEqual({});
    expect(record.hospitalization.diagnoses).toEqual([]);
  });
});
