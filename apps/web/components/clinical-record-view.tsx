import type { ClinicalRecord } from "@audit/domain";
import {
  failedChunksIndicator,
  failedPagesIndicator,
  ui,
} from "@audit/lib/i18n";
import {
  DischargeSection,
  HistorySection,
  HospitalizationSection,
  LaboratorySection,
  MedicationsSection,
  MicrobiologySection,
  PatientSection,
  StudiesSection,
} from "./clinical-record-sections.tsx";

export function ClinicalRecordView({
  documentId,
  record,
  incomplete,
  failedPages,
  failedChunks,
}: {
  documentId: string;
  record: ClinicalRecord;
  incomplete: boolean;
  failedPages: number[];
  failedChunks: number;
}) {
  return (
    <section className="flex flex-col gap-6">
      {incomplete ? (
        <div className="text-[#d1242f]" role="alert">
          <strong>{ui.incompleteAnalysis}</strong>
          {failedPages.length > 0 ? (
            <span> {failedPagesIndicator(failedPages)}</span>
          ) : null}
          {failedChunks > 0 ? (
            <span> {failedChunksIndicator(failedChunks)}</span>
          ) : null}
        </div>
      ) : null}

      <PatientSection documentId={documentId} patient={record.patient} />
      <HospitalizationSection
        documentId={documentId}
        hospitalization={record.hospitalization}
      />
      <HistorySection documentId={documentId} history={record.history} />
      <MedicationsSection
        documentId={documentId}
        medications={record.medications}
      />
      <LaboratorySection
        documentId={documentId}
        laboratory={record.laboratory}
      />
      <StudiesSection documentId={documentId} studies={record.studies} />
      <MicrobiologySection
        documentId={documentId}
        microbiology={record.microbiology}
      />
      <DischargeSection documentId={documentId} discharge={record.discharge} />
    </section>
  );
}
