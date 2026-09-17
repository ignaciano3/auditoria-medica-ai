import type { ClinicalRecord } from "@audit/domain";
import {
  clinicalRecord,
  failedChunksIndicator,
  failedPagesIndicator,
  ui,
} from "@audit/lib/i18n";

function display(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

export function ClinicalRecordView({
  record,
  incomplete,
  failedPages,
  failedChunks,
}: {
  record: ClinicalRecord;
  incomplete: boolean;
  failedPages: number[];
  failedChunks: number;
}) {
  const name = display(record.patient.name?.value);
  const age = display(record.patient.age?.value);
  const sex = display(record.patient.sex?.value);
  const hasPatient =
    name !== undefined || age !== undefined || sex !== undefined;

  const admissionDate = display(record.hospitalization.admissionDate?.value);
  const dischargeDate = display(record.hospitalization.dischargeDate?.value);
  const reason = display(record.hospitalization.reason?.value);
  const hasHospitalization =
    admissionDate !== undefined ||
    dischargeDate !== undefined ||
    reason !== undefined;

  const diagnoses = record.hospitalization.diagnoses;

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

      <section className="flex flex-col gap-2 rounded-lg border border-foreground/20 p-4">
        <h2 className="text-base font-semibold">{clinicalRecord.patient}</h2>
        {hasPatient ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {name !== undefined ? (
              <>
                <dt className="font-semibold">{clinicalRecord.patient}</dt>
                <dd>{name}</dd>
              </>
            ) : null}
            {age !== undefined ? (
              <>
                <dt className="font-semibold">{clinicalRecord.age}</dt>
                <dd>{age}</dd>
              </>
            ) : null}
            {sex !== undefined ? (
              <>
                <dt className="font-semibold">{clinicalRecord.sex}</dt>
                <dd>{sex}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="text-foreground/60">{clinicalRecord.noInfo}</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-foreground/20 p-4">
        <h2 className="text-base font-semibold">
          {clinicalRecord.hospitalization}
        </h2>
        {hasHospitalization ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {admissionDate !== undefined ? (
              <>
                <dt className="font-semibold">
                  {clinicalRecord.admissionDate}
                </dt>
                <dd>{admissionDate}</dd>
              </>
            ) : null}
            {dischargeDate !== undefined ? (
              <>
                <dt className="font-semibold">
                  {clinicalRecord.dischargeDate}
                </dt>
                <dd>{dischargeDate}</dd>
              </>
            ) : null}
            {reason !== undefined ? (
              <>
                <dt className="font-semibold">{clinicalRecord.reason}</dt>
                <dd>{reason}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="text-foreground/60">{clinicalRecord.noInfo}</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-foreground/20 p-4">
        <h2 className="text-base font-semibold">{clinicalRecord.diagnoses}</h2>
        {diagnoses.length > 0 ? (
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {diagnoses.map((diagnosis) => (
              <li key={diagnosis.value}>{diagnosis.value}</li>
            ))}
          </ul>
        ) : (
          <p className="text-foreground/60">{clinicalRecord.noInfo}</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-foreground/20 p-4">
        <h2 className="text-base font-semibold">{ui.summary}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="font-semibold">{clinicalRecord.medications}</dt>
          <dd>{record.medications.length}</dd>
          <dt className="font-semibold">{clinicalRecord.laboratory}</dt>
          <dd>{record.laboratory.length}</dd>
          <dt className="font-semibold">{clinicalRecord.studies}</dt>
          <dd>{record.studies.length}</dd>
          <dt className="font-semibold">{clinicalRecord.microbiology}</dt>
          <dd>{record.microbiology.length}</dd>
        </dl>
      </section>
    </section>
  );
}
