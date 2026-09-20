import type { ClinicalEventType, ClinicalRecord } from "./clinical-record.ts";
import {
  compareNormalizedDates,
  type NormalizedDate,
  normalizeDate,
} from "./dates.ts";
import type { ExtractedValue, Source } from "./source.ts";

export type TimelineDetail =
  | { kind: "admission" }
  | { kind: "discharge" }
  | { kind: "medication"; name: string; change: "start" | "stop" }
  | { kind: "laboratory"; name: string; value: string; unit?: string }
  | { kind: "study"; studyType: string; result?: string }
  | {
      kind: "microbiology";
      sample?: string;
      organism?: string;
      result?: string;
    }
  | { kind: "documented"; description: string };

export type TimelineEntry = {
  id: string;
  type: ClinicalEventType;
  date?: string;
  normalized?: NormalizedDate;
  sources: Source[];
  detail: TimelineDetail;
};

export type TimelineGroup = {
  key: string;
  date?: string;
  undated: boolean;
  entries: TimelineEntry[];
};

type DraftEntry = {
  type: ClinicalEventType;
  date?: string;
  sources: Source[];
  detail: TimelineDetail;
};

const NARRATIVE_TYPES: ReadonlySet<ClinicalEventType> = new Set([
  "diagnosis",
  "clinical_evolution",
  "procedure",
  "medication_change",
  "other",
]);

const COVERED_TYPE: Partial<Record<ClinicalEventType, ClinicalEventType>> = {
  admission: "admission",
  discharge: "discharge",
  medication_start: "medication_start",
  medication_stop: "medication_stop",
  laboratory: "laboratory",
  imaging: "imaging",
  microbiology: "microbiology",
};

function extractedDraft(
  type: ClinicalEventType,
  extracted: ExtractedValue<string>,
  detail: TimelineDetail,
): DraftEntry {
  return {
    type,
    date: extracted.value,
    sources: extracted.sources,
    detail,
  };
}

function structuredDrafts(record: ClinicalRecord): DraftEntry[] {
  const drafts: DraftEntry[] = [];
  const { hospitalization, medications, laboratory, studies, microbiology } =
    record;

  if (hospitalization.admissionDate !== undefined) {
    drafts.push(
      extractedDraft("admission", hospitalization.admissionDate, {
        kind: "admission",
      }),
    );
  }
  if (hospitalization.dischargeDate !== undefined) {
    drafts.push(
      extractedDraft("discharge", hospitalization.dischargeDate, {
        kind: "discharge",
      }),
    );
  }
  for (const medication of medications) {
    if (medication.startDate !== undefined) {
      drafts.push(
        extractedDraft("medication_start", medication.startDate, {
          kind: "medication",
          name: medication.name.value,
          change: "start",
        }),
      );
    }
    if (medication.endDate !== undefined) {
      drafts.push(
        extractedDraft("medication_stop", medication.endDate, {
          kind: "medication",
          name: medication.name.value,
          change: "stop",
        }),
      );
    }
  }
  for (const result of laboratory) {
    drafts.push({
      type: "laboratory",
      ...(result.date !== undefined ? { date: result.date.value } : {}),
      sources: result.date?.sources ?? result.sources,
      detail: {
        kind: "laboratory",
        name: result.name.value,
        value: result.value.value,
        ...(result.unit !== undefined ? { unit: result.unit.value } : {}),
      },
    });
  }
  for (const study of studies) {
    drafts.push({
      type: "imaging",
      ...(study.date !== undefined ? { date: study.date.value } : {}),
      sources: study.date?.sources ?? study.sources,
      detail: {
        kind: "study",
        studyType: study.type.value,
        ...(study.result !== undefined ? { result: study.result.value } : {}),
      },
    });
  }
  for (const result of microbiology) {
    drafts.push({
      type: "microbiology",
      ...(result.date !== undefined ? { date: result.date.value } : {}),
      sources: result.date?.sources ?? result.sources,
      detail: {
        kind: "microbiology",
        ...(result.sample !== undefined ? { sample: result.sample.value } : {}),
        ...(result.organism !== undefined
          ? { organism: result.organism.value }
          : {}),
        ...(result.result !== undefined ? { result: result.result.value } : {}),
      },
    });
  }

  return drafts;
}

function documentedDrafts(
  record: ClinicalRecord,
  structured: DraftEntry[],
): DraftEntry[] {
  const structuredPages = new Set(
    structured.map(
      (draft) => `${draft.type}|${draft.sources[0]?.pageNumber ?? ""}`,
    ),
  );
  const drafts: DraftEntry[] = [];

  for (const event of record.clinicalEvents) {
    const covered = COVERED_TYPE[event.type];
    if (covered !== undefined && !NARRATIVE_TYPES.has(event.type)) {
      const page = event.sources[0]?.pageNumber ?? "";
      if (structuredPages.has(`${covered}|${page}`)) continue;
    }
    drafts.push({
      type: event.type,
      ...(event.date !== undefined ? { date: event.date } : {}),
      sources: event.sources,
      detail: { kind: "documented", description: event.description },
    });
  }

  return drafts;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detailText(detail: TimelineDetail): string {
  switch (detail.kind) {
    case "admission":
      return "admission";
    case "discharge":
      return "discharge";
    case "medication":
      return `${detail.change} ${detail.name}`;
    case "laboratory":
      return [detail.name, detail.value, detail.unit ?? ""].join(" ");
    case "study":
      return [detail.studyType, detail.result ?? ""].join(" ");
    case "microbiology":
      return [detail.sample ?? "", detail.organism ?? "", detail.result ?? ""]
        .join(" ")
        .trim();
    case "documented":
      return detail.description;
  }
}

function draftSignature(draft: DraftEntry): string {
  return `${draft.type}|${normalizeText(detailText(draft.detail))}|${draft.date ?? ""}`;
}

function djb2Hex(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function referenceYearOf(record: ClinicalRecord): number | undefined {
  const admission = record.hospitalization.admissionDate?.value;
  if (admission === undefined) return undefined;
  const iso = normalizeDate(admission).iso;
  return iso === undefined ? undefined : Number(iso.slice(0, 4));
}

function toEntry(
  draft: DraftEntry,
  id: string,
  context: { referenceYear?: number },
): TimelineEntry {
  const normalized =
    draft.date === undefined ? undefined : normalizeDate(draft.date, context);
  return {
    id,
    type: draft.type,
    ...(draft.date !== undefined ? { date: draft.date } : {}),
    ...(normalized !== undefined ? { normalized } : {}),
    sources: draft.sources,
    detail: draft.detail,
  };
}

export function buildTimeline(record: ClinicalRecord): TimelineGroup[] {
  const structured = structuredDrafts(record);
  const drafts = [...structured, ...documentedDrafts(record, structured)];

  const seen = new Set<string>();
  const unique: DraftEntry[] = [];
  for (const draft of drafts) {
    const signature = draftSignature(draft);
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(draft);
  }

  const referenceYear = referenceYearOf(record);
  const context = referenceYear === undefined ? {} : { referenceYear };

  const occurrences = new Map<string, number>();
  const ordered = unique
    .map((draft, index) => ({
      draft,
      index,
      signature: draftSignature(draft),
    }))
    .sort((a, b) => {
      if (a.signature < b.signature) return -1;
      if (a.signature > b.signature) return 1;
      return a.index - b.index;
    });

  const withIds = ordered.map((item) => {
    const base = `evt-${djb2Hex(item.signature)}`;
    const count = occurrences.get(base) ?? 0;
    occurrences.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    return { index: item.index, entry: toEntry(item.draft, id, context) };
  });

  const entries = withIds
    .sort((a, b) => a.index - b.index)
    .map((item) => item.entry);

  const dated = entries.filter((entry) => entry.normalized?.iso !== undefined);
  const undated = entries.filter(
    (entry) => entry.normalized?.iso === undefined,
  );
  dated.sort((a, b) => compareNormalizedDates(a.normalized, b.normalized));

  const groups: TimelineGroup[] = [];
  for (const entry of dated) {
    const iso = entry.normalized?.iso;
    if (iso === undefined) continue;
    const last = groups[groups.length - 1];
    if (last !== undefined && last.key === iso) {
      last.entries.push(entry);
    } else {
      groups.push({ key: iso, date: iso, undated: false, entries: [entry] });
    }
  }
  if (undated.length > 0) {
    groups.push({ key: "undated", undated: true, entries: undated });
  }

  return groups;
}
