import { z } from "zod";

const schema = z
  .object({
    DATABASE_URL: z.string().url(),
    S3_ENDPOINT: z.string().url(),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    LLM_PROVIDER: z.enum(["openai", "heuristic"]).default("openai"),
    LLM_MODEL: z.string().min(1),
    OCR_PROVIDER: z.enum(["openai", "tesseract", "local"]).default("openai"),
    OCR_MODEL: z.string().min(1),
    OPENAI_API_KEY: z.string().default(""),
    DOCUMENT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  })
  .superRefine((env, ctx) => {
    const usesOpenAI =
      env.LLM_PROVIDER === "openai" || env.OCR_PROVIDER === "openai";
    if (usesOpenAI && env.OPENAI_API_KEY.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message:
          "OPENAI_API_KEY is required when LLM_PROVIDER or OCR_PROVIDER is openai",
      });
    }
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
