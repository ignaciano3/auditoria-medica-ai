import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  LLM_PROVIDER: z.enum(["openai"]).default("openai"),
  LLM_MODEL: z.string().min(1),
  OCR_PROVIDER: z.enum(["openai"]).default("openai"),
  OCR_MODEL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  DOCUMENT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  return schema.parse(source);
}

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    cached = parseEnv();
  }
  return cached;
}
