import type { ControlOverview } from '@/hooks/use-controls-overview';
import { serverApi } from '@/lib/api-server';
import { PageHeader, PageHeaderDescription, PageLayout, Stack } from '@trycompai/design-system';
import type { Metadata } from 'next';
import { ControlsHeaderActions } from './components/ControlsHeaderActions';
import { ControlsOverview } from './components/ControlsOverview';

export const metadata: Metadata = { title: 'Controls' };

type CreateOptions = {
  policies: { id: string; name: string }[];
  tasks: { id: string; title: string }[];
  requirements: {
    id: string;
    name: string;
    identifier: string;
    frameworkInstanceId: string;
    frameworkName: string;
  }[];
};

export default async function ControlsPage() {
  const [overviewRes, optionsRes] = await Promise.all([
    serverApi.get<{ data: ControlOverview[] }>('/v1/controls/overview'),
    serverApi.get<CreateOptions>('/v1/controls/options'),
  ]);
  const options = optionsRes.data ?? { policies: [], tasks: [], requirements: [] };

  return (
    <PageLayout>
      <Stack gap="md">
        <PageHeader title="Controls" actions={<ControlsHeaderActions options={options} />}>
          <PageHeaderDescription>
            Each control maps to ISO 27001 and PCI DSS requirements. Evidence linked to a control
            counts for every framework it maps to.
          </PageHeaderDescription>
        </PageHeader>
        <ControlsOverview initialControls={overviewRes.data?.data} />
      </Stack>
    </PageLayout>
  );
}
