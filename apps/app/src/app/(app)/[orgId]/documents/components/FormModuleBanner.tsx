'use client';

import { apiClient } from '@/lib/api-client';
import { HStack, Stack, Text } from '@trycompai/design-system';
import { Information, Launch } from '@trycompai/design-system/icons';
import Link from 'next/link';
import useSWR from 'swr';

type ModuleStatus = {
  successor: { label: string; path: string; recordCount: number } | null;
  latestPentest: { id: string; vendor: string | null; scannedAt: string; passed: boolean | null; findingCount: number } | null;
};

const linkClass =
  'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-3 text-[13px] font-medium hover:bg-muted';
const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** Banner text for a retired form (#130): where its evidence lives now. */
export function retiredFormMessage(successor: NonNullable<ModuleStatus['successor']>): string {
  if (successor.recordCount > 0) {
    return `This form is retired. ${successor.label} holds this evidence now (${successor.recordCount} record${successor.recordCount === 1 ? '' : 's'}), so new evidence goes there. Past submissions stay here and in exports for earlier audit periods.`;
  }
  return `This form is being replaced by ${successor.label}. Add your records there; until then you can still submit here.`;
}

/**
 * On a retired form: a link to the module that replaced it. On the
 * penetration test form: the latest pentest recorded under Vulnerabilities.
 */
export function FormModuleBanner({ organizationId, formType }: { organizationId: string; formType: string }) {
  const { data } = useSWR(['/v1/evidence-forms/module-status', formType, organizationId], async () => {
    const res = await apiClient.get<ModuleStatus>(`/v1/evidence-forms/${formType}/module-status`, organizationId);
    if (res.error || !res.data) throw new Error(res.error ?? 'Failed to load the module status');
    return res.data;
  });
  if (!data) return null;

  if (data.successor) {
    return (
      <Banner
        text={retiredFormMessage(data.successor)}
        href={`/${organizationId}${data.successor.path}`}
        linkLabel={`Open ${data.successor.label}`}
      />
    );
  }
  if (formType !== 'penetration-test') return null;
  const scan = data.latestPentest;
  return (
    <Banner
      text={
        scan
          ? `Latest pentest: ${scan.vendor ?? 'unnamed tester'} on ${formatDate(scan.scannedAt)}, ${
              scan.passed === false ? 'failed' : scan.passed ? 'passed' : 'result not recorded'
            }, ${scan.findingCount} finding${scan.findingCount === 1 ? '' : 's'}. Record new tests under Vulnerabilities > Scans; use this form for the report summary.`
          : 'No pentest is recorded under Vulnerabilities > Scans yet. Record it there so its findings follow your SLA policy.'
      }
      href={`/${organizationId}/vulnerabilities`}
      linkLabel="Open Vulnerabilities"
    />
  );
}

function Banner({ text, href, linkLabel }: { text: string; href: string; linkLabel: string }) {
  return (
    <div role="status" className="rounded-lg border border-l-4 border-border border-l-primary bg-primary/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <HStack gap="sm" align="start">
          <Information size={20} className="mt-0.5 shrink-0 text-primary" />
          <Stack gap="none">
            <Text size="sm">{text}</Text>
          </Stack>
        </HStack>
        <Link href={href} className={linkClass}>
          {linkLabel}
          <Launch size={14} />
        </Link>
      </div>
    </div>
  );
}
