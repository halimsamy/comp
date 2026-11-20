import { Injectable } from '@nestjs/common';
import { HIPAA_TRAINING_ID } from '@trycompai/company';
import { GENERAL_TRAINING_MODULE_ID } from './training-cycles';
import { renderHousePdf, type HouseKeyValue, type PdfSection } from '../utils/house-pdf';

const formatDate = (date: Date) =>
  new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

/** jsPDF's standard fonts are Latin-1 only: drop invisible characters and fold smart punctuation. */
export function cleanTextForPDF(text: string): string {
  const replacements: Record<string, string> = {
    '‘': "'",
    '’': "'",
    '“': '"',
    '”': '"',
    '–': '-',
    '—': '-',
    '…': '...',
    ' ': ' ',
  };
  return text
    .replace(/[­​-‏‪-‮⁠-⁯﻿�]/g, '')
    .replace(/[‘’“”–—… ]/g, (char) => replacements[char]);
}

interface CertificateParams {
  memberId: string;
  userName: string;
  organizationName: string;
  completedAt: Date;
  primaryColor?: string | null;
}

@Injectable()
export class TrainingCertificatePdfService {
  async generateHipaaCertificatePdf(params: CertificateParams): Promise<Buffer> {
    return this.generateCertificatePdf({
      ...params,
      title: 'HIPAA Security Awareness Training',
      program: 'HIPAA Security Awareness Training program',
      certificateId: certificateIdFor({ ...params, moduleId: HIPAA_TRAINING_ID }),
    });
  }

  async generateTrainingCertificatePdf(params: CertificateParams): Promise<Buffer> {
    return this.generateCertificatePdf({
      ...params,
      title: 'Security Awareness Training',
      program: 'Security Awareness Training program',
      certificateId: certificateIdFor({ ...params, moduleId: GENERAL_TRAINING_MODULE_ID }),
    });
  }

  /** Certificate for any training cycle (custom modules, past cycles). */
  async generateCustomCertificatePdf(
    params: CertificateParams & { title: string; details: CertificateDetails },
  ): Promise<Buffer> {
    return this.generateCertificatePdf({
      ...params,
      program: `${params.title} program`,
      certificateId: params.details.certificateId,
    });
  }

  private async generateCertificatePdf({
    userName,
    organizationName,
    completedAt,
    primaryColor,
    title,
    program,
    certificateId,
    details,
  }: Omit<CertificateParams, 'memberId'> & {
    title: string;
    program: string;
    certificateId: string;
    details?: CertificateDetails;
  }): Promise<Buffer> {
    const name = cleanTextForPDF(userName);
    const org = cleanTextForPDF(organizationName);
    const completedOn = formatDate(completedAt);

    // #75: validity, certificate ID, requirement and the modules covered, for auditors.
    // Document ID first, as in the ISMS exports.
    const rows: HouseKeyValue[] = [
      { label: 'Certificate ID', value: certificateId },
      { label: 'Awarded to', value: name },
      { label: 'Organization', value: org },
      { label: 'Training', value: cleanTextForPDF(title) },
      { label: 'Completed on', value: completedOn },
      ...(details
        ? [
            { label: 'Valid until', value: formatDate(details.validUntil) },
            ...(details.requirement
              ? [{ label: 'Requirement', value: cleanTextForPDF(details.requirement) }]
              : []),
          ]
        : []),
    ];

    const sections: PdfSection[] = [
      {
        heading: '1. Attestation',
        paragraphs: [
          { text: 'This is to certify that' },
          { text: name, bold: true },
          {
            text: `has successfully completed all modules of the ${cleanTextForPDF(program)} for ${org}, on ${completedOn}.`,
          },
        ],
      },
      ...(details?.modules.length
        ? [{ heading: '2. Modules covered', bullets: details.modules.map(cleanTextForPDF) }]
        : []),
      {
        heading: `${details?.modules.length ? 3 : 2}. Certification`,
        keyValues: [
          { label: 'Certified by', value: 'Comp AI' },
          { label: 'Platform', value: 'AI-powered compliance platform' },
          { label: 'Website', value: 'https://trycomp.ai' },
        ],
      },
    ];

    return renderHousePdf({
      title: cleanTextForPDF(title),
      subtitle: `Awarded to ${name}`,
      label: 'Certificate of completion',
      documentCode: certificateId,
      organizationName: org,
      primaryColor: primaryColor ?? null,
      classification: 'Internal',
      rows,
      sections,
    });
  }
}

const BUILT_IN_MODULE_TOKENS: Record<string, string> = {
  [GENERAL_TRAINING_MODULE_ID]: 'GENERAL',
  [HIPAA_TRAINING_ID]: 'HIPAA',
};

/** One ID per member, module and completion day, shared by live downloads and history cycles. */
export function certificateIdFor({
  memberId,
  moduleId,
  completedAt,
}: {
  memberId: string;
  moduleId: string;
  completedAt: Date;
}): string {
  const day = completedAt.toISOString().slice(0, 10).replace(/-/g, '');
  const module = BUILT_IN_MODULE_TOKENS[moduleId] ?? moduleId.slice(-6);
  return `TC-${memberId.slice(-6)}-${module}-${day}`.toUpperCase();
}

export interface CertificateDetails {
  validUntil: Date;
  certificateId: string;
  requirement: string | null;
  modules: string[];
}
