import { redirect } from 'next/navigation';
import { CompanyOverviewCards } from './components/CompanyOverviewCards';
import { DocumentSettings } from './components/DocumentSettings';
import { DocumentsPageTabs } from './components/DocumentsPageTabs';

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgId } = await params;
  // The ISMS moved to its own page (#53); keep old links working.
  if ((await searchParams).tab === 'iso-27001') redirect(`/${orgId}/documents/isms`);

  return (
    <DocumentsPageTabs
      companyFormsContent={<CompanyOverviewCards organizationId={orgId} />}
      settingsContent={<DocumentSettings organizationId={orgId} />}
    />
  );
}
