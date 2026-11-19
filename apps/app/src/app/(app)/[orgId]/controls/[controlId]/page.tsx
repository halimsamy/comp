import { serverApi } from '@/lib/api-server';
import { PageHeader, PageHeaderDescription, PageLayout } from '@trycompai/design-system';
import type { Control } from '@db';
import { redirect } from 'next/navigation';
import { ControlHeaderActions } from './components/ControlHeaderActions';
import { ControlOwnerSelect, type ControlOwnerSummary } from './components/ControlOwnerSelect';
import { ControlEvidenceStatus, SingleControl, type UnifiedControl } from './components/SingleControl';

type ControlDetail = Control & UnifiedControl & { owner: ControlOwnerSummary | null };

interface ControlPageProps {
  params: Promise<{ controlId: string; orgId: string }>;
  searchParams: Promise<{ framework?: string }>;
}

/** The one control page; framework pages link here with ?framework=<instance id>. */
export default async function ControlPage({ params, searchParams }: ControlPageProps) {
  const { controlId, orgId } = await params;
  const { framework } = await searchParams;

  const controlRes = await serverApi.get<ControlDetail>(`/v1/controls/${controlId}`);
  if (!controlRes.data || controlRes.error) {
    redirect(`/${orgId}/controls`);
  }
  const control = controlRes.data;

  // Only honour ?framework= for a framework this control is mapped in.
  const fromFramework = control.requirementsMapped.find((r) => r.frameworkInstanceId === framework);
  const frameworkName =
    fromFramework?.frameworkInstance.framework?.name ?? fromFramework?.frameworkInstance.customFramework?.name;
  const breadcrumbs = fromFramework
    ? [
        { label: 'Frameworks', href: `/${orgId}/frameworks` },
        { label: frameworkName ?? 'Framework', href: `/${orgId}/frameworks/${fromFramework.frameworkInstanceId}` },
        { label: control.name, isCurrent: true },
      ]
    : [
        { label: 'Controls', href: `/${orgId}/controls` },
        { label: control.name, isCurrent: true },
      ];

  return (
    <PageLayout>
      <PageHeader
        title={control.name}
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <ControlOwnerSelect controlId={control.id} owner={control.owner ?? null} />
            <ControlHeaderActions control={control} />
          </div>
        }
      >
        {control.description ? <PageHeaderDescription>{control.description}</PageHeaderDescription> : null}
      </PageHeader>
      <ControlEvidenceStatus controlId={control.id} />
      <SingleControl
        orgId={orgId}
        control={control}
        frameworkInstanceId={fromFramework?.frameworkInstanceId ?? null}
      />
    </PageLayout>
  );
}
