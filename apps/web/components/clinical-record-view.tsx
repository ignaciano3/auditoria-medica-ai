"use client";

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
    <section className="record-view">
      {incomplete ? (
        <div className="error" role="alert">
          <strong>{ui.incompleteAnalysis}</strong>
          {failedPages.length > 0 ? (
            <span> {failedPagesIndicator(failedPages)}</span>
          ) : null}
          {failedChunks > 0 ? (
            <span> {failedChunksIndicator(failedChunks)}</span>
          ) : null}
        </div>
      ) : null}

      <section className="card">
        <h2 className="card-title">{clinicalRecord.patient}</h2>
        {hasPatient ? (
          <dl className="record-fields">
            {name !== undefined ? (
              <>
                <dt>{clinicalRecord.patient}</dt>
                <dd>{name}</dd>
              </>
            ) : null}
            {age !== undefined ? (
              <>
                <dt>{clinicalRecord.age}</dt>
                <dd>{age}</dd>
              </>
            ) : null}
            {sex !== undefined ? (
              <>
                <dt>{clinicalRecord.sex}</dt>
                <dd>{sex}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="muted">{clinicalRecord.noInfo}</p>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">{clinicalRecord.hospitalization}</h2>
        {hasHospitalization ? (
          <dl className="record-fields">
            {admissionDate !== undefined ? (
              <>
                <dt>{clinicalRecord.admissionDate}</dt>
                <dd>{admissionDate}</dd>
              </>
            ) : null}
            {dischargeDate !== undefined ? (
              <>
                <dt>{clinicalRecord.dischargeDate}</dt>
                <dd>{dischargeDate}</dd>
              </>
            ) : null}
            {reason !== undefined ? (
              <>
                <dt>{clinicalRecord.reason}</dt>
                <dd>{reason}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="muted">{clinicalRecord.noInfo}</p>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">{clinicalRecord.diagnoses}</h2>
        {diagnoses.length > 0 ? (
          <ul className="record-list">
            {diagnoses.map((diagnosis) => (
              <li key={diagnosis.value}>{diagnosis.value}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">{clinicalRecord.noInfo}</p>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">{ui.summary}</h2>
        <dl className="record-fields">
          <dt>{clinicalRecord.medications}</dt>
          <dd>{record.medications.length}</dd>
          <dt>{clinicalRecord.laboratory}</dt>
          <dd>{record.laboratory.length}</dd>
          <dt>{clinicalRecord.studies}</dt>
          <dd>{record.studies.length}</dd>
          <dt>{clinicalRecord.microbiology}</dt>
          <dd>{record.microbiology.length}</dd>
        </dl>
      </section>
    </section>
  );
}
