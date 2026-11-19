import { evidenceFormDefinitions } from './definitions';
import type { EvidenceFormType } from './form-types';

/** Months a submission of this form stays current (per-form cadence, N9). */
export function evidenceFormCadenceMonths(formType: EvidenceFormType): number {
  return evidenceFormDefinitions[formType].cadenceMonths;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** When the next submission is due: last submission + cadence. Null when never submitted. */
export function evidenceFormNextDueAt({
  formType,
  lastSubmittedAt,
  cadenceMonths,
}: {
  formType: EvidenceFormType;
  lastSubmittedAt: Date | string | null | undefined;
  /** The organization's override of the form's cadence. */
  cadenceMonths?: number | null;
}): Date | null {
  const last = toDate(lastSubmittedAt);
  if (!last) return null;
  const due = new Date(last);
  due.setUTCMonth(due.getUTCMonth() + (cadenceMonths ?? evidenceFormCadenceMonths(formType)));
  return due;
}

/** True when the latest submission is still inside the form's cadence window. */
export function isEvidenceFormFresh({
  formType,
  lastSubmittedAt,
  cadenceMonths,
  now = new Date(),
}: {
  formType: EvidenceFormType;
  lastSubmittedAt: Date | string | null | undefined;
  cadenceMonths?: number | null;
  now?: Date;
}): boolean {
  const due = evidenceFormNextDueAt({ formType, lastSubmittedAt, cadenceMonths });
  return due !== null && due.getTime() > now.getTime();
}
