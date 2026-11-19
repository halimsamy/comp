import { Section, Stack } from '@trycompai/design-system';
import { Download } from '@trycompai/design-system/icons';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { CONTEXT_QUESTIONS, type CompanyContext } from '../lib/company-context';

/**
 * Who the company is, for the auditor (#193): the company context answers and
 * the logo, next to the evidence they audit. Replaces the old Auditor View.
 */
export function AuditCompanyTab({ company }: { company: CompanyContext }) {
  const { organizationName, logoUrl, answers, cSuite, signatory } = company;
  return (
    <Stack gap="xl">
      <Section title="Company information">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {logoUrl ? (
            <InfoCell label="Logo">
              <a
                href={logoUrl}
                download={`${organizationName.replace(/[^a-zA-Z0-9]/g, '_')}_logo`}
                className="group relative block h-14 w-14 overflow-hidden rounded-lg border bg-background"
                title="Download logo"
              >
                <Image src={logoUrl} alt={`${organizationName} logo`} fill className="object-contain" unoptimized />
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Download size={16} className="text-white" />
                </span>
              </a>
            </InfoCell>
          ) : null}
          <InfoCell label="Employees">{answers[CONTEXT_QUESTIONS.employees] || '—'}</InfoCell>
          <InfoCell label="Report signatory">
            {signatory ? (
              <div>
                <span className="font-medium">{signatory.fullName}</span>{' '}
                <span className="text-xs text-muted-foreground">{signatory.jobTitle}</span>
                <div className="text-xs text-muted-foreground">{signatory.email}</div>
              </div>
            ) : (
              '—'
            )}
          </InfoCell>
          <InfoCell label="Executive team">
            {cSuite.length > 0
              ? cSuite.map((exec) => (
                  <div key={`${exec.name}-${exec.title}`}>
                    <span className="font-medium">{exec.name}</span>{' '}
                    <span className="text-xs text-muted-foreground">{exec.title}</span>
                  </div>
                ))
              : '—'}
          </InfoCell>
        </div>
      </Section>
      <Section title="Business overview">
        <Stack gap="lg">
          <ContentRow title={CONTEXT_QUESTIONS.background} content={answers[CONTEXT_QUESTIONS.background]} />
          <ContentRow title={CONTEXT_QUESTIONS.services} content={answers[CONTEXT_QUESTIONS.services]} />
          <ContentRow title={CONTEXT_QUESTIONS.mission} content={answers[CONTEXT_QUESTIONS.mission]} />
        </Stack>
      </Section>
      <Section title="System architecture">
        <ContentRow title={CONTEXT_QUESTIONS.system} content={answers[CONTEXT_QUESTIONS.system]} />
      </Section>
      <Section title="Third-party dependencies">
        <div className="grid gap-6 lg:grid-cols-2">
          <ContentRow title={CONTEXT_QUESTIONS.vendors} content={answers[CONTEXT_QUESTIONS.vendors]} />
          <ContentRow title={CONTEXT_QUESTIONS.subservice} content={answers[CONTEXT_QUESTIONS.subservice]} />
        </div>
      </Section>
    </Stack>
  );
}

function InfoCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function ContentRow({ title, content }: { title: string; content?: string }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {content?.trim() ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{content}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Not answered yet (Settings → Context)</p>
      )}
    </div>
  );
}
