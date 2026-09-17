import { z } from "zod";
import { evidenceSchema } from "./clinical-record.ts";
import type { Evidence } from "./source.ts";

export const FINDING_SEVERITIES = ["high", "medium", "low", "info"] as const;

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_CATEGORIES = [
  "temporal",
  "contradiction",
  "medication",
  "documentation",
  "audit",
  "other",
] as const;

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export type Finding = {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  explanation: string;
  evidence: Evidence[];
  recommendation?: string;
  requiresHumanReview: true;
};

export const findingSchema = z.object({
  id: z.string(),
  severity: z.enum(FINDING_SEVERITIES),
  category: z.enum(FINDING_CATEGORIES),
  title: z.string(),
  explanation: z.string(),
  evidence: z.array(evidenceSchema).min(1),
  recommendation: z.string().optional(),
  requiresHumanReview: z.literal(true),
});
