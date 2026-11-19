'use client';

import { UpdateOrganizationEvidenceApproval } from '@/components/forms/organization/update-organization-evidence-approval';
import type { Member, Task, User } from '@db';
import { Button, PageHeader, PageLayout, Tabs, TabsList, TabsTrigger } from '@trycompai/design-system';
import { Add } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { useTasks } from '../hooks/useTasks';
import { usePermissions } from '@/hooks/use-permissions';
import type { FrameworkInstanceForTasks } from '../types';
import { CreateTaskSheet } from './CreateTaskSheet';
import { EvidenceExportButton } from './EvidenceExportButton';
import { TaskList } from './TaskList';

interface TasksPageClientProps {
  tasks: (Task & {
    controls: { id: string; name: string }[];
    evidenceAutomations?: Array<{
      id: string;
      isEnabled: boolean;
      name: string;
      runs?: Array<{
        status: string;
        success: boolean | null;
        evaluationStatus: string | null;
        createdAt: Date;
        triggeredBy: string;
        runDuration: number | null;
      }>;
    }>;
  })[];
  members: (Member & { user: User })[];
  controls: { id: string; name: string }[];
  frameworkInstances: FrameworkInstanceForTasks[];
  activeTab: 'categories' | 'list';
  orgId: string;
  organizationName: string | null;
  hasEvidenceExportAccess: boolean;
  evidenceApprovalEnabled: boolean;
}

export function TasksPageClient({
  tasks: initialTasks,
  members,
  controls,
  frameworkInstances,
  activeTab,
  hasEvidenceExportAccess,
  evidenceApprovalEnabled,
}: TasksPageClientProps) {
  const { tasks, createTask } = useTasks({ initialData: initialTasks });
  const { hasPermission } = usePermissions();
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [mainTab, setMainTab] = useState('evidence-list');

  return (
    <Tabs defaultValue="evidence-list" onValueChange={setMainTab}>
      <PageLayout
        header={
          <PageHeader
            title="Evidence"
            actions={
              <div className="flex items-center gap-2">
                {hasEvidenceExportAccess && <EvidenceExportButton frameworkInstances={frameworkInstances} />}
                {hasPermission('task', 'create') && (
                  <Button iconLeft={<Add />} onClick={() => setIsCreateSheetOpen(true)}>
                    Create Evidence
                  </Button>
                )}
              </div>
            }
          />
        }
      >
        <TaskList
          tasks={tasks}
          members={members}
          frameworkInstances={frameworkInstances}
          activeTab={activeTab}
          evidenceApprovalEnabled={evidenceApprovalEnabled}
          afterAnalytics={
            <div className="w-fit">
              <TabsList variant="underline">
                <TabsTrigger value="evidence-list">Overview</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>
            </div>
          }
          showFiltersAndList={mainTab === 'evidence-list'}
        />
        {mainTab === 'settings' && (
          <UpdateOrganizationEvidenceApproval evidenceApprovalEnabled={evidenceApprovalEnabled} />
        )}
        <CreateTaskSheet
          members={members}
          controls={controls}
          open={isCreateSheetOpen}
          onOpenChange={setIsCreateSheetOpen}
          createTask={createTask}
        />
      </PageLayout>
    </Tabs>
  );
}
