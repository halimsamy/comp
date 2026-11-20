import { HIPAA_TRAINING_ID } from '@trycompai/company';
import { certificateIdFor, type CertificateDetails } from './training-certificate-pdf.service';
import { GENERAL_TRAINING_MODULE_ID, type TrainingCycle } from './training-cycles';

const GENERAL_MODULES = [1, 2, 3, 4, 5].map((n) => `Security Awareness Training - Part ${n}`);

/** Validity, a stable certificate ID, the requirement it evidences and the modules it covers (#75). */
export function certificateDetails({
  cycle,
  memberId,
  module,
}: {
  cycle: TrainingCycle;
  memberId: string;
  module: { frameworkReference: string | null; title: string } | null;
}): CertificateDetails {
  const certificateId = certificateIdFor({
    memberId,
    moduleId: cycle.moduleId,
    completedAt: cycle.completedAt,
  });
  if (cycle.moduleId === GENERAL_TRAINING_MODULE_ID) {
    return {
      validUntil: cycle.expiresAt,
      certificateId,
      requirement: 'ISO/IEC 27001:2022 A.6.3; PCI DSS v4.0.1 12.6.1-12.6.3',
      modules: GENERAL_MODULES,
    };
  }
  if (cycle.moduleId === HIPAA_TRAINING_ID) {
    return {
      validUntil: cycle.expiresAt,
      certificateId,
      requirement: 'HIPAA 45 CFR 164.308(a)(5)',
      modules: ['HIPAA Security Awareness Training'],
    };
  }
  return {
    validUntil: cycle.expiresAt,
    certificateId,
    requirement: module?.frameworkReference ?? null,
    modules: [module?.title ?? cycle.title],
  };
}
