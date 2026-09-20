import type { TimelineGroup } from "@audit/domain";
import { timeline as timelineLabels, ui } from "@audit/lib/i18n";
import { sourcePages } from "../lib/clinical-record-view.ts";
import { describeEntry, groupLabel } from "../lib/timeline-view.ts";
import { EvidenceLinks } from "./evidence-link.tsx";
import { Section } from "./ui/section.tsx";

export function Timeline({
  documentId,
  groups,
}: {
  documentId: string;
  groups: TimelineGroup[];
}) {
  const count = groups.reduce(
    (total, group) => total + group.entries.length,
    0,
  );

  return (
    <Section title={ui.timeline} count={count} defaultOpen>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">{timelineLabels.empty}</p>
      ) : (
        <ol className="flex list-none flex-col gap-4">
          {groups.map((group) => (
            <li key={group.key} className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-muted-foreground">
                {groupLabel(group)}
              </p>
              <ul className="flex list-none flex-col gap-2 border-l border-border pl-4">
                {group.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]"
                  >
                    <span>{describeEntry(entry)}</span>
                    <EvidenceLinks
                      documentId={documentId}
                      pages={sourcePages(entry.sources)}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
