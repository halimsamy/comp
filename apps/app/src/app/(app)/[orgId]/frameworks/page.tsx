import { serverApi } from '@/lib/api-server';
import type { FrameworkEditorFramework } from '@db';
import { PageHeader, PageLayout } from '@trycompai/design-system';
import type { FrameworkInstanceWithControls } from '@/lib/types/framework';
import { FrameworksTable } from './components/FrameworksTable';
import { FrameworksPageActions } from './components/FrameworksPageActions';

export async function generateMetadata() {
  return { title: 'Frameworks' };
}

type FrameworkWithScore = FrameworkInstanceWithControls & {
  complianceScore: number;
  controlsComplete: number;
  controlsTotal: number;
};

export default async function FrameworksPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: organizationId } = await params;

  const [frameworksRes, availableRes] = await Promise.all([
    serverApi.get<{ data: FrameworkWithScore[] }>('/v1/frameworks?includeControls=true&includeScores=true'),
    serverApi.get<{ data: FrameworkEditorFramework[] }>('/v1/frameworks/available'),
  ]);

  const frameworksData = frameworksRes.data?.data ?? [];
  const allFrameworks = availableRes.data?.data ?? [];

  const frameworksWithControls = frameworksData.map(
    ({ complianceScore: _score, controlsComplete: _done, controlsTotal: _total, ...fw }) => fw,
  );
  const scoreMap = Object.fromEntries(
    frameworksData.map((fw) => [
      fw.id,
      {
        complianceScore: fw.complianceScore ?? 0,
        controlsComplete: fw.controlsComplete ?? 0,
        controlsTotal: fw.controlsTotal ?? fw.controls.length,
      },
    ]),
  );

  const availableToAdd = allFrameworks.filter(
    (framework) =>
      !frameworksWithControls.some(
        (fc) =>
          fc.framework?.id === framework.id ||
          fc.customFramework?.id === framework.id,
      ),
  );

  return (
    <PageLayout
      header={
        <PageHeader
          title="Frameworks"
          actions={
            <FrameworksPageActions availableFrameworks={availableToAdd} />
          }
        />
      }
    >
      <FrameworksTable
        frameworks={frameworksWithControls}
        scoreMap={scoreMap}
        organizationId={organizationId}
      />
    </PageLayout>
  );
}
