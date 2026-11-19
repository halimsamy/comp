import { serverApi } from '@/lib/api-server';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageLayout,
} from '@trycompai/design-system';
import { redirect } from 'next/navigation';
import { RequirementControls } from './components/RequirementControls';
import { AddCustomControlSheet } from './components/AddCustomControlSheet';
import { LinkExistingControlSheet } from './components/LinkExistingControlSheet';
import { RequirementApplicabilityCard } from './components/RequirementApplicabilityCard';
import { RequirementEvidence } from './components/RequirementEvidence';
import { RequirementIntro } from './components/RequirementIntro';
import { stripIdentifier } from '../../components/requirement-name';

interface PageProps {
  params: Promise<{
    orgId: string;
    frameworkInstanceId: string;
    requirementKey: string;
  }>;
}

export default async function RequirementPage({ params }: PageProps) {
  const { orgId: organizationId, frameworkInstanceId, requirementKey } =
    await params;

  const [frameworkRes, requirementRes] = await Promise.all([
    serverApi.get<any>(`/v1/frameworks/${frameworkInstanceId}`),
    serverApi.get<any>(
      `/v1/frameworks/${frameworkInstanceId}/requirements/${requirementKey}`,
    ),
  ]);

  if (!frameworkRes.data || !requirementRes.data) {
    redirect(`/${organizationId}/frameworks/${frameworkInstanceId}`);
  }

  const framework = frameworkRes.data;
  const reqData = requirementRes.data;
  const frameworkName =
    framework.framework?.name ?? framework.customFramework?.name ?? 'Framework';
  const requirement = reqData.requirement;
  // Whether this specific requirement is custom — NOT whether its framework is.
  // A platform framework (e.g. ISO 27001) can carry per-instance custom
  // requirements, in which case requirement.kind is 'custom' even though
  // framework.customFrameworkId is null.
  const isCustomRequirement = requirement.kind === 'custom';

  const identifier: string | undefined = requirement.identifier?.trim() || undefined;
  const title = identifier ?? requirement.name;
  const displayName = identifier ? stripIdentifier({ name: requirement.name, identifier }) : null;
  const showNameAsDescription = Boolean(displayName) && displayName !== identifier;
  const isPci = /pci/i.test(frameworkName);
  const isIso = /iso/i.test(frameworkName);
  const objective =
    isIso && identifier?.startsWith('A.')
      ? await loadAnnexObjective({
          frameworkId: framework.frameworkId,
          organizationId,
          closure: identifier.slice(2),
        })
      : null;
  const definitions: { id: string; identifier: string }[] = framework.requirementDefinitions ?? [];
  const childCount = identifier
    ? definitions.filter((d) => d.identifier.startsWith(`${identifier}.`)).length
    : 0;
  const controlOptions = ((framework.controls ?? []) as { id: string; name: string }[]).map(
    (c) => ({ id: c.id, name: c.name }),
  );
  const mappedControlIds: string[] = (reqData.relatedControls ?? []).map(
    (rc: { control: { id: string } }) => rc.control.id,
  );

  return (
    <PageLayout>
      <PageHeader
        title={title}
        breadcrumbs={[
          { label: 'Frameworks', href: `/${organizationId}/frameworks` },
          {
            label: frameworkName,
            href: `/${organizationId}/frameworks/${frameworkInstanceId}`,
          },
          { label: identifier ?? 'Requirement', isCurrent: true },
        ]}
      >
        {showNameAsDescription ? (
          <PageHeaderDescription>{displayName}</PageHeaderDescription>
        ) : null}
        <PageHeaderActions>
          <LinkExistingControlSheet
            frameworkInstanceId={frameworkInstanceId}
            requirementId={requirementKey}
            isCustomRequirement={isCustomRequirement}
            alreadyMappedControlIds={mappedControlIds}
          />
          <AddCustomControlSheet
            frameworkInstanceId={frameworkInstanceId}
            requirementId={requirementKey}
            isCustomRequirement={isCustomRequirement}
          />
        </PageHeaderActions>
      </PageHeader>
      <RequirementIntro
        isPci={isPci}
        description={requirement.description ?? null}
        objective={objective}
      />
      {reqData.applicabilityRules ? (
        <RequirementApplicabilityCard
          orgId={organizationId}
          frameworkInstanceId={frameworkInstanceId}
          requirementKey={requirementKey}
          record={reqData.applicability ?? null}
          rules={reqData.applicabilityRules}
          identifier={identifier ?? null}
          childCount={childCount}
          controlOptions={controlOptions}
        />
      ) : null}
      <RequirementControls
        relatedControls={reqData.relatedControls ?? []}
        requirementScore={reqData.requirementScore ?? null}
        controlScores={reqData.controlScores ?? {}}
        frameworkInstanceId={frameworkInstanceId}
      />
      <RequirementEvidence orgId={organizationId} controlIds={mappedControlIds} />
    </PageLayout>
  );
}

/** ISO Annex A control objective from the SoA configuration; null when unavailable (e.g. no audit:read). */
async function loadAnnexObjective({
  frameworkId,
  organizationId,
  closure,
}: {
  frameworkId: string | null;
  organizationId: string;
  closure: string;
}): Promise<string | null> {
  if (!frameworkId) return null;
  const res = await serverApi.post<{
    configuration: { questions?: { columnMapping?: { closure?: string; control_objective?: string | null } }[] } | null;
  }>('/v1/soa/get-setup', { frameworkId, organizationId });
  const question = res.data?.configuration?.questions?.find(
    (q) => q.columnMapping?.closure === closure,
  );
  return question?.columnMapping?.control_objective ?? null;
}
