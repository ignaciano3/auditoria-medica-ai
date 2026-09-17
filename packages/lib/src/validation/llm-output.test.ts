import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { LLMOutputValidationError, validateLLMOutput } from "./llm-output.ts";

const schema = z.object({ value: z.string() });

describe("validateLLMOutput", () => {
  test("returns parsed output without retrying when valid", async () => {
    let calls = 0;

    const result = await validateLLMOutput(
      schema,
      '{"value":"ok"}',
      async () => {
        calls += 1;
        return '{"value":"retry"}';
      },
    );

    expect(result).toEqual({ value: "ok" });
    expect(calls).toBe(0);
  });

  test("retries once when the raw output is not JSON", async () => {
    let calls = 0;

    const result = await validateLLMOutput(schema, "not-json", async () => {
      calls += 1;
      return '{"value":"retry"}';
    });

    expect(result).toEqual({ value: "retry" });
    expect(calls).toBe(1);
  });

  test("retries once when the parsed output fails the schema", async () => {
    let calls = 0;

    const result = await validateLLMOutput(schema, '{"value":1}', async () => {
      calls += 1;
      return '{"value":"retry"}';
    });

    expect(result).toEqual({ value: "retry" });
    expect(calls).toBe(1);
  });

  test("throws after a second invalid response and never coerces", async () => {
    let calls = 0;

    let thrown: unknown;
    try {
      await validateLLMOutput(schema, '{"value":42}', async () => {
        calls += 1;
        return '{"value":42}';
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(LLMOutputValidationError);
    expect(calls).toBe(1);
  });

  test("throws a PHI-free error message", async () => {
    const raw = '{"value":"Paciente Juan Perez, VIH positivo"}';

    let thrown: unknown;
    try {
      await validateLLMOutput(
        z.object({ value: z.number() }),
        raw,
        async () => raw,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(LLMOutputValidationError);
    const message = (thrown as Error).message;
    expect(message).toBe("LLM output failed schema validation after one retry");
    expect(message).not.toContain("Juan");
    expect(message).not.toContain("VIH");
    expect(message).not.toContain(raw);
  });
});
