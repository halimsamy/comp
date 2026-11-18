'use client';

import { useRegisterExport } from '@/components/register-export/ExportRegisterButton';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HStack,
  PageHeader,
  PageLayout,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@trycompai/design-system';
import { Add, Download, OverflowMenuVertical } from '@trycompai/design-system/icons';
import type { Role } from '@db';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { InviteMembersModal } from '../all/components/InviteMembersModal';

interface PeoplePageTabsProps {
  peopleContent: ReactNode;
  employeeTasksContent: ReactNode | null;
  devicesContent: ReactNode;
  orgChartContent: ReactNode;
  accessContent?: ReactNode;
  findingsContent?: ReactNode | null;
  roleMappingContent: ReactNode | null;
  showRoleMapping: boolean;
  showEmployeeTasks: boolean;
  settingsContent: ReactNode | null;
  showSettings: boolean;
  canInviteUsers: boolean;
  canManageMembers: boolean;
  allowedBuiltInRoles: Role[];
  organizationId: string;
}

/** ?tab= value → Radix tab value */
function tabParamToInternal(
  tabParam: string | null,
  showEmployeeTasks: boolean,
  showRoleMapping: boolean,
  showSettings: boolean,
): string {
  if (!tabParam || tabParam === 'people') {
    return 'people';
  }
  if (tabParam === 'tasks') {
    return showEmployeeTasks ? 'employee-tasks' : 'people';
  }
  if (tabParam === 'devices') {
    return 'devices';
  }
  if (tabParam === 'chart') {
    return 'org-chart';
  }
  if (tabParam === 'access') {
    return 'access';
  }
  if (tabParam === 'role-mapping') {
    return showRoleMapping ? 'role-mapping' : 'people';
  }
  if (tabParam === 'settings') {
    return showSettings ? 'settings' : 'people';
  }
  return 'people';
}

/** Radix tab value → ?tab= query param */
function internalValueToTabParam(value: string): string {
  switch (value) {
    case 'employee-tasks':
      return 'tasks';
    case 'org-chart':
      return 'chart';
    case 'people':
    case 'devices':
    case 'access':
    case 'role-mapping':
    case 'settings':
      return value;
    default:
      return 'people';
  }
}

export function PeoplePageTabs({
  peopleContent,
  employeeTasksContent,
  devicesContent,
  orgChartContent,
  accessContent,
  findingsContent,
  roleMappingContent,
  showRoleMapping,
  showEmployeeTasks,
  settingsContent,
  showSettings,
  canInviteUsers,
  canManageMembers,
  allowedBuiltInRoles,
  organizationId,
}: PeoplePageTabsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const canExportPeople = hasPermission('member', 'read');
  const { exporting, handleExport } = useRegisterExport();

  const activeTab = tabParamToInternal(
    searchParams.get('tab'),
    showEmployeeTasks,
    showRoleMapping,
    showSettings,
  );

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const tabParam = internalValueToTabParam(value);
      if (tabParam === 'people') {
        params.delete('tab');
      } else {
        params.set('tab', tabParam);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <PageLayout
        header={
          <PageHeader
            title="People"
            tabs={
              <TabsList variant="underline">
                <TabsTrigger value="people">People</TabsTrigger>
                {showEmployeeTasks && <TabsTrigger value="employee-tasks">Tasks</TabsTrigger>}
                <TabsTrigger value="devices">Devices</TabsTrigger>
                <TabsTrigger value="org-chart">Chart</TabsTrigger>
                {accessContent && <TabsTrigger value="access">Access</TabsTrigger>}
                {showRoleMapping && <TabsTrigger value="role-mapping">Role Mapping</TabsTrigger>}
                {showSettings && <TabsTrigger value="settings">Settings</TabsTrigger>}
              </TabsList>
            }
            actions={
              <HStack gap="2">
                <div>
                  <Button
                    iconLeft={<Add size={16} />}
                    onClick={() => setIsInviteModalOpen(true)}
                    disabled={!canInviteUsers}
                  >
                    Add User
                  </Button>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline" size="icon" />}
                  >
                    <OverflowMenuVertical size={16} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        window.open('/api/offboarding-export?all=true', '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <Download size={14} className="mr-2" />
                      Export offboarding
                    </DropdownMenuItem>
                    {canExportPeople && (
                      <>
                        <DropdownMenuItem
                          disabled={exporting !== null}
                          onClick={() => handleExport('people')}
                        >
                          <Download size={14} className="mr-2" />
                          Export people (CSV)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={exporting !== null}
                          onClick={() => handleExport('devices')}
                        >
                          <Download size={14} className="mr-2" />
                          Export devices (CSV)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={exporting !== null}
                          onClick={() => handleExport('offboarding')}
                        >
                          <Download size={14} className="mr-2" />
                          Export offboarding records (CSV)
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </HStack>
            }
          />
        }
      >
        <TabsContent value="people">{peopleContent}</TabsContent>
        {showEmployeeTasks && (
          <TabsContent value="employee-tasks">{employeeTasksContent}</TabsContent>
        )}
        <TabsContent value="devices">{devicesContent}</TabsContent>
        <TabsContent value="org-chart">{orgChartContent}</TabsContent>
        {accessContent && <TabsContent value="access">{accessContent}</TabsContent>}
        {showRoleMapping && (
          <TabsContent value="role-mapping">{roleMappingContent}</TabsContent>
        )}
        {showSettings && (
          <TabsContent value="settings">{settingsContent}</TabsContent>
        )}
      </PageLayout>

      <InviteMembersModal
        open={isInviteModalOpen}
        onOpenChange={setIsInviteModalOpen}
        organizationId={organizationId}
        allowedBuiltInRoles={allowedBuiltInRoles}
      />
    </Tabs>
  );
}
