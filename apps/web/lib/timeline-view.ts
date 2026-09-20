import type { TimelineEntry, TimelineGroup } from "@audit/domain";
import { timeline } from "@audit/lib/i18n";

export function formatDateLabel(iso: string): string {
  const parts = iso.split("-");
  const month = parts[1];
  const day = parts[2];
  if (month === undefined || day === undefined) return iso;
  return `${day}/${month}`;
}

export function groupLabel(group: TimelineGroup): string {
  if (group.undated || group.date === undefined) return timeline.undated;
  return formatDateLabel(group.date);
}

export function describeEntry(entry: TimelineEntry): string {
  const detail = entry.detail;
  switch (detail.kind) {
    case "admission":
      return timeline.admission;
    case "discharge":
      return timeline.discharge;
    case "medication": {
      const prefix =
        detail.change === "start" ? timeline.startPrefix : timeline.stopPrefix;
      return `${prefix} ${detail.name}`;
    }
    case "laboratory": {
      const unit =
        detail.unit !== undefined && detail.unit !== ""
          ? ` ${detail.unit}`
          : "";
      return `${detail.name}: ${detail.value}${unit}`;
    }
    case "study":
      return detail.result !== undefined && detail.result !== ""
        ? `${detail.studyType}: ${detail.result}`
        : detail.studyType;
    case "microbiology": {
      const parts = [detail.sample, detail.organism, detail.result].filter(
        (part): part is string => part !== undefined && part !== "",
      );
      return parts.length > 0
        ? parts.join(" · ")
        : timeline.microbiologyFallback;
    }
    case "documented":
      return detail.description;
  }
}
