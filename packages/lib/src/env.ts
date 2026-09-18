import { z } from "zod";

export const PROVIDER_MODELS = {
  openai: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-astra"],
  deepseek: ["deepseek-flash", "deepseek-v4-pro"],
  qwen: ["qwen3.8-flash", "qwen3.8-max", "qwen3-vl-plus"],
} as const;

export type Provider = keyof typeof PROVIDER_MODELS;

export type SupportedModel = (typeof PROVIDER_MODELS)[Provider][number];

const KEY_FIELD = {
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  qwen: "DASHSCOPE_API_KEY",
} as const satisfies Record<Provider, string>;

function supportsModel(provider: Provider, model: string): boolean {
  return (PROVIDER_MODELS[provider] as readonly string[]).includes(model);
}

function ocrModelProvider(
  provider: "openai" | "deepseek" | "qwen" | "tesseract" | "local",
): Provider | undefined {
  if (provider === "local") return undefined;
  if (provider === "tesseract") return "openai";
  return provider;
}

const schema = z
  .object({
    DATABASE_URL: z.string().url(),
    S3_ENDPOINT: z.string().url(),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    LLM_PROVIDER: z
      .enum(["openai", "deepseek", "qwen", "heuristic"])
      .default("openai"),
    LLM_MODEL: z.string().min(1),
    OCR_PROVIDER: z
      .enum(["openai", "deepseek", "qwen", "tesseract", "local"])
      .default("tesseract"),
    OCR_MODEL: z.string().min(1),
    OPENAI_API_KEY: z.string().default(""),
    DEEPSEEK_API_KEY: z.string().default(""),
    DASHSCOPE_API_KEY: z.string().default(""),
    DOCUMENT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  })
  .superRefine((env, ctx) => {
    if (
      env.LLM_PROVIDER !== "heuristic" &&
      !supportsModel(env.LLM_PROVIDER, env.LLM_MODEL)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["LLM_MODEL"],
        message: `LLM_MODEL must be one of ${PROVIDER_MODELS[env.LLM_PROVIDER].join(", ")} for LLM_PROVIDER ${env.LLM_PROVIDER}`,
      });
    }

    const ocrProvider = ocrModelProvider(env.OCR_PROVIDER);
    if (ocrProvider && !supportsModel(ocrProvider, env.OCR_MODEL)) {
      ctx.addIssue({
        code: "custom",
        path: ["OCR_MODEL"],
        message: `OCR_MODEL must be one of ${PROVIDER_MODELS[ocrProvider].join(", ")} for OCR_PROVIDER ${env.OCR_PROVIDER}`,
      });
    }

    const requiredKeys = new Set<keyof typeof env>();
    if (env.LLM_PROVIDER !== "heuristic") {
      requiredKeys.add(KEY_FIELD[env.LLM_PROVIDER]);
    }
    if (env.OCR_PROVIDER === "tesseract") {
      requiredKeys.add("OPENAI_API_KEY");
    } else if (env.OCR_PROVIDER !== "local") {
      requiredKeys.add(KEY_FIELD[env.OCR_PROVIDER]);
    }

    for (const key of requiredKeys) {
      const value = env[key];
      if (typeof value === "string" && value.trim() === "") {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required for the selected providers`,
        });
      }
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
