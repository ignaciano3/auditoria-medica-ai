import { z } from "zod";
import type { ExtractedValue, Source } from "./source.ts";

export const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const sourceSchema = z.object({
  documentId: z.string(),
  pageNumber: z.number(),
  text: z.string(),
  boundingBox: boundingBoxSchema.optional(),
});

export function extractedValueSchema<T extends z.ZodType>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    confidence: z.number().optional(),
    sources: z.array(sourceSchema).min(1),
  });
}

export const evidenceSchema = z.object({
  source: sourceSchema,
  relevance: z.string(),
});

export type Patient = {
  name?: ExtractedValue<string>;
  age?: ExtractedValue<number>;
  sex?: ExtractedValue<string>;
  birthDate?: ExtractedValue<string>;
};

export const MEDICATION_STATUSES = ["active", "stopped", "unknown"] as const;

export type MedicationStatus = (typeof MEDICATION_STATUSES)[number];

export type Medication = {
  name: ExtractedValue<string>;
  dose?: ExtractedValue<string>;
  route?: ExtractedValue<string>;
  frequency?: ExtractedValue<string>;
  startDate?: ExtractedValue<string>;
  endDate?: ExtractedValue<string>;
  status?: MedicationStatus;
  sources: Source[];
};

export type LabResult = {
  date?: ExtractedValue<string>;
  name: ExtractedValue<string>;
  value: ExtractedValue<string>;
  unit?: ExtractedValue<string>;
  referenceRange?: ExtractedValue<string>;
  sources: Source[];
};

export type Study = {
  date?: ExtractedValue<string>;
  type: ExtractedValue<string>;
  indication?: ExtractedValue<string>;
  result?: ExtractedValue<string>;
  sources: Source[];
};

export type MicrobiologyResult = {
  date?: ExtractedValue<string>;
  sample?: ExtractedValue<string>;
  organism?: ExtractedValue<string>;
  result?: ExtractedValue<string>;
  sensitivity?: ExtractedValue<string>;
  sources: Source[];
};

export const CLINICAL_EVENT_TYPES = [
  "admission",
  "diagnosis",
  "laboratory",
  "imaging",
  "microbiology",
  "medication_start",
  "medication_change",
  "medication_stop",
  "clinical_evolution",
  "procedure",
  "discharge",
  "other",
] as const;

export type ClinicalEventType = (typeof CLINICAL_EVENT_TYPES)[number];

export type ClinicalEvent = {
  date?: string;
  type: ClinicalEventType;
  description: string;
  sources: Source[];
};

export type DischargeInformation = {
  date?: ExtractedValue<string>;
  conditionAtDischarge?: ExtractedValue<string>;
  diagnosis?: ExtractedValue<string>;
  treatment?: ExtractedValue<string>;
  instructions?: ExtractedValue<string>;
  warningSigns?: ExtractedValue<string>;
  followUp?: ExtractedValue<string>;
};

export type Hospitalization = {
  admissionDate?: ExtractedValue<string>;
  dischargeDate?: ExtractedValue<string>;
  reason?: ExtractedValue<string>;
  diagnoses: ExtractedValue<string>[];
  dischargeDiagnosis?: ExtractedValue<string>;
  admissionDateConflicts?: ExtractedValue<string>[];
  dischargeDateConflicts?: ExtractedValue<string>[];
};

export type MedicalHistory = {
  pathological: ExtractedValue<string>[];
  allergies: ExtractedValue<string>[];
  usualMedications: Medication[];
};

export type ClinicalRecord = {
  patient: Patient;
  hospitalization: Hospitalization;
  history: MedicalHistory;
  medications: Medication[];
  laboratory: LabResult[];
  studies: Study[];
  microbiology: MicrobiologyResult[];
  clinicalEvents: ClinicalEvent[];
  discharge?: DischargeInformation;
};

export const patientSchema = z.object({
  name: extractedValueSchema(z.string()).optional(),
  age: extractedValueSchema(z.number()).optional(),
  sex: extractedValueSchema(z.string()).optional(),
  birthDate: extractedValueSchema(z.string()).optional(),
});

export const medicationSchema = z.object({
  name: extractedValueSchema(z.string()),
  dose: extractedValueSchema(z.string()).optional(),
  route: extractedValueSchema(z.string()).optional(),
  frequency: extractedValueSchema(z.string()).optional(),
  startDate: extractedValueSchema(z.string()).optional(),
  endDate: extractedValueSchema(z.string()).optional(),
  status: z.enum(MEDICATION_STATUSES).optional(),
  sources: z.array(sourceSchema).min(1),
});

export const labResultSchema = z.object({
  date: extractedValueSchema(z.string()).optional(),
  name: extractedValueSchema(z.string()),
  value: extractedValueSchema(z.string()),
  unit: extractedValueSchema(z.string()).optional(),
  referenceRange: extractedValueSchema(z.string()).optional(),
  sources: z.array(sourceSchema).min(1),
});

export const studySchema = z.object({
  date: extractedValueSchema(z.string()).optional(),
  type: extractedValueSchema(z.string()),
  indication: extractedValueSchema(z.string()).optional(),
  result: extractedValueSchema(z.string()).optional(),
  sources: z.array(sourceSchema).min(1),
});

export const microbiologyResultSchema = z.object({
  date: extractedValueSchema(z.string()).optional(),
  sample: extractedValueSchema(z.string()).optional(),
  organism: extractedValueSchema(z.string()).optional(),
  result: extractedValueSchema(z.string()).optional(),
  sensitivity: extractedValueSchema(z.string()).optional(),
  sources: z.array(sourceSchema).min(1),
});

export const clinicalEventSchema = z.object({
  date: z.string().optional(),
  type: z.enum(CLINICAL_EVENT_TYPES),
  description: z.string(),
  sources: z.array(sourceSchema).min(1),
});

export const dischargeSchema = z.object({
  date: extractedValueSchema(z.string()).optional(),
  conditionAtDischarge: extractedValueSchema(z.string()).optional(),
  diagnosis: extractedValueSchema(z.string()).optional(),
  treatment: extractedValueSchema(z.string()).optional(),
  instructions: extractedValueSchema(z.string()).optional(),
  warningSigns: extractedValueSchema(z.string()).optional(),
  followUp: extractedValueSchema(z.string()).optional(),
});

export const hospitalizationSchema = z.object({
  admissionDate: extractedValueSchema(z.string()).optional(),
  dischargeDate: extractedValueSchema(z.string()).optional(),
  reason: extractedValueSchema(z.string()).optional(),
  diagnoses: z.array(extractedValueSchema(z.string())).default([]),
  dischargeDiagnosis: extractedValueSchema(z.string()).optional(),
  admissionDateConflicts: z.array(extractedValueSchema(z.string())).default([]),
  dischargeDateConflicts: z.array(extractedValueSchema(z.string())).default([]),
});

export const historySchema = z.object({
  pathological: z.array(extractedValueSchema(z.string())).default([]),
  allergies: z.array(extractedValueSchema(z.string())).default([]),
  usualMedications: z.array(medicationSchema).default([]),
});

export const clinicalRecordSchema = z.object({
  patient: patientSchema.default({}),
  hospitalization: hospitalizationSchema.default({
    diagnoses: [],
    admissionDateConflicts: [],
    dischargeDateConflicts: [],
  }),
  history: historySchema.default({
    pathological: [],
    allergies: [],
    usualMedications: [],
  }),
  medications: z.array(medicationSchema).default([]),
  laboratory: z.array(labResultSchema).default([]),
  studies: z.array(studySchema).default([]),
  microbiology: z.array(microbiologyResultSchema).default([]),
  clinicalEvents: z.array(clinicalEventSchema).default([]),
  discharge: dischargeSchema.optional(),
});
