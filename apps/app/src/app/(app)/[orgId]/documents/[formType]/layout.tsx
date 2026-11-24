import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

/** Penetration tests are recorded under Vulnerabilities > Scans, which files them as this form's evidence. */
export default async function CompanyFormLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgId: string; formType: string }>;
}) {
  const { orgId, formType } = await params;
  if (formType === 'penetration-test') redirect(`/${orgId}/vulnerabilities?tab=scans`);
  return children;
}
