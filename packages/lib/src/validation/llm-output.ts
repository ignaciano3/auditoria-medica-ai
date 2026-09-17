import type { ZodType } from "zod";

export class LLMOutputValidationError extends Error {
  constructor() {
    super("LLM output failed schema validation after one retry");
    this.name = "LLMOutputValidationError";
  }
}

type ParseResult<T> = { ok: true; data: T } | { ok: false };

function tryParse<T>(schema: ZodType<T>, raw: string): ParseResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) return { ok: false };
  return { ok: true, data: result.data };
}

export async function validateLLMOutput<T>(
  schema: ZodType<T>,
  raw: string,
  retry: () => Promise<string>,
): Promise<T> {
  const first = tryParse(schema, raw);
  if (first.ok) return first.data;
  const second = tryParse(schema, await retry());
  if (second.ok) return second.data;
  throw new LLMOutputValidationError();
}
