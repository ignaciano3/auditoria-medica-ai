import { describe, expect, test } from "bun:test";
import type { ClinicalRecord } from "@audit/domain";
import {
  buildChatUserPrompt,
  CHAT_SYSTEM_PROMPT,
  type ChatContext,
} from "./prompts.ts";

const record: ClinicalRecord = {
  patient: {},
  hospitalization: { diagnoses: [] },
  history: { pathological: [], allergies: [], usualMedications: [] },
  medications: [],
  laboratory: [],
  studies: [],
  microbiology: [],
  clinicalEvents: [],
};

const context: ChatContext = {
  documentId: "d1",
  record,
  findings: [],
  pages: [{ pageNumber: 5, text: "Levofloxacina 500 mg", score: 2 }],
  history: [{ role: "user", content: "¿Qué antibiótico?" }],
  question: "¿Cuándo se inició?",
};

describe("chat prompts", () => {
  test("the system prompt carries the exact fallback sentence", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain(
      "No encontré información suficiente en la documentación analizada para determinarlo.",
    );
  });

  test("the user prompt delimits record, findings, pages, history and question", () => {
    const prompt = buildChatUserPrompt(context);
    expect(prompt).toContain("<record>");
    expect(prompt).toContain('"hospitalization"');
    expect(prompt).toContain("</record>");
    expect(prompt).toContain("<findings>");
    expect(prompt).toContain("</findings>");
    expect(prompt).toContain("<pages>");
    expect(prompt).toContain('<page n="5">');
    expect(prompt).toContain("Levofloxacina 500 mg");
    expect(prompt).toContain("</page>");
    expect(prompt).toContain("</pages>");
    expect(prompt).toContain("<history>");
    expect(prompt).toContain("¿Qué antibiótico?");
    expect(prompt).toContain("</history>");
    expect(prompt).toContain("<question>¿Cuándo se inició?</question>");
  });
});
