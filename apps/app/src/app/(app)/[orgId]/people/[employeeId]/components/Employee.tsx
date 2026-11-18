'use client';

import type { TrainingVideo } from '@/lib/data/training-videos';
import type { EmployeeTrainingVideoCompletion, Member, Organization, Policy, User } from '@db';
import {
  PageLayout,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@trycompai/design-system';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { DeviceWithChecks, FleetPolicy, Host } from '../../devices/types';
import type { BackgroundCheckBillingStatus, BackgroundCheckRecord } from './backgroundCheckTypes';
import { EmployeeBackgroundCheck } from './EmployeeBackgroundCheck';
import { EmployeeDetails } from './EmployeeDetails';
import { EmployeeDevice } from './EmployeeDevice';
import { EmployeePageHeader } from './EmployeePageHeader';
import { EmployeeAccess } from './EmployeeAccess';
import { EmployeePolicies } from './EmployeePolicies';
import { EmployeeHipaaTraining, EmployeeTrainingVideos } from './EmployeeTraining';
import { EmploymentDocuments } from './EmploymentDocuments';
import { MemberComplianceOverview } from './MemberComplianceOverview';
import { MemberKeyDates } from './MemberKeyDates';
import { MemberTrainingHistory } from './MemberTrainingHistory';
import { OnboardingChecklist } from './OnboardingChecklist';
import { isAuditorOnly } from './isAuditorOnly';
import { OffboardingChecklist } from './OffboardingChecklist';

type EmployeeTab =
  | 'overview'
  | 'details'
  | 'onboarding'
  | 'policies'
  | 'training'
  | 'hipaa'
  | 'device'
  | 'access'
  | 'offboarding'
  | 'background-check';

interface EmployeeProps {
  employee: Member & {
    user: User;
  };
  policies: Policy[];
  trainingVideos: (EmployeeTrainingVideoCompletion & {
    metadata: TrainingVideo;
  })[];
  fleetPolicies: FleetPolicy[];
  host: Host;
  canEdit: boolean;
  organization: Organization;
  memberDevice: DeviceWithChecks | null;
  orgId: string;
  hasHipaaFramework: boolean;
  hipaaCompletedAt: Date | null;
  initialBackgroundCheck: BackgroundCheckRecord | null;
  initialBackgroundCheckBillingStatus: BackgroundCheckBillingStatus;
  backgroundCheckStepEnabled: boolean;
  memberBackgroundCheckExempt: boolean;
}

export function Employee({
  employee,
  policies,
  trainingVideos,
  fleetPolicies,
  host,
  canEdit,
  organization,
  memberDevice,
  orgId,
  hasHipaaFramework,
  hipaaCompletedAt,
  initialBackgroundCheck,
  initialBackgroundCheckBillingStatus,
  backgroundCheckStepEnabled,
  memberBackgroundCheckExempt,
}: EmployeeProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // CS-416: auditor-only members aren't subject to background checks, so the
  // tab, header status, and content are hidden for them.
  const showBackgroundCheck = backgroundCheckStepEnabled && !isAuditorOnly(employee.role);

  const availableTabs: EmployeeTab[] = [
    'overview',
    'details',
    'onboarding',
    'policies',
    'training',
    ...(hasHipaaFramework ? (['hipaa'] as EmployeeTab[]) : []),
    'device',
    'access',
    ...(showBackgroundCheck ? (['background-check'] as EmployeeTab[]) : []),
    ...(employee.offboardDate ? (['offboarding'] as EmployeeTab[]) : []),
  ];

  const resolveTab = (): EmployeeTab => {
    if (
      showBackgroundCheck &&
      (searchParams.get('background_check_step') || searchParams.get('background_check_billing'))
    ) {
      return 'background-check';
    }
    const tabParam = searchParams.get('tab');
    if (tabParam && availableTabs.includes(tabParam as EmployeeTab)) {
      return tabParam as EmployeeTab;
    }
    return 'overview';
  };

  const activeTab = resolveTab();

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === 'overview') {
        params.delete('tab');
      } else {
        params.set('tab', value);
      }
      params.delete('background_check_step');
      params.delete('background_check_billing');
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const [memberExempt, setMemberExempt] = useState(memberBackgroundCheckExempt);
  const [lastSyncedExempt, setLastSyncedExempt] = useState(memberBackgroundCheckExempt);

  if (memberBackgroundCheckExempt !== lastSyncedExempt) {
    setLastSyncedExempt(memberBackgroundCheckExempt);
    setMemberExempt(memberBackgroundCheckExempt);
  }

  return (
    <PageLayout
      header={
        <EmployeePageHeader
          employeeName={employee.user.name ?? 'Employee'}
          orgId={orgId}
          backgroundCheck={initialBackgroundCheck}
          backgroundCheckStepEnabled={showBackgroundCheck}
          memberBackgroundCheckExempt={memberExempt}
        />
      }
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value) handleTabChange(value);
        }}
      >
        <Stack gap="4">
          <div className="overflow-x-auto">
            <TabsList variant="underline">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
              <TabsTrigger value="policies">Policies</TabsTrigger>
              <TabsTrigger value="training">Training</TabsTrigger>
              {hasHipaaFramework && <TabsTrigger value="hipaa">HIPAA Training</TabsTrigger>}
              <TabsTrigger value="device">Device</TabsTrigger>
              <TabsTrigger value="access">Access</TabsTrigger>
              {showBackgroundCheck && (
                <TabsTrigger value="background-check">Background Check</TabsTrigger>
              )}
              {employee.offboardDate && <TabsTrigger value="offboarding">Offboarding</TabsTrigger>}
            </TabsList>
          </div>
          <TabsContent value="overview">
            <MemberComplianceOverview
              memberId={employee.id}
              availableTabs={availableTabs}
              onOpenTab={handleTabChange}
            />
          </TabsContent>
          <TabsContent value="details">
            <Stack gap="4">
              <MemberKeyDates memberId={employee.id} />
              <EmployeeDetails employee={employee} canEdit={canEdit} />
            </Stack>
          </TabsContent>
          <TabsContent value="onboarding">
            <OnboardingChecklist memberId={employee.id} canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="policies">
            <EmployeePolicies employee={employee} policies={policies} />
          </TabsContent>
          <TabsContent value="training">
            <Stack gap="6">
              <EmployeeTrainingVideos
                employee={employee}
                trainingVideos={trainingVideos}
                organization={organization}
              />
              <MemberTrainingHistory memberId={employee.id} />
            </Stack>
          </TabsContent>
          {hasHipaaFramework && (
            <TabsContent value="hipaa">
              <EmployeeHipaaTraining
                employee={employee}
                organization={organization}
                hipaaCompletedAt={hipaaCompletedAt}
              />
            </TabsContent>
          )}
          <TabsContent value="access">
            <EmployeeAccess memberId={employee.id} organizationId={orgId} />
          </TabsContent>
          <TabsContent value="device">
            <EmployeeDevice
              organization={organization}
              memberDevice={memberDevice}
              host={host}
              fleetPolicies={fleetPolicies}
            />
          </TabsContent>
          {employee.offboardDate && (
            <TabsContent value="offboarding">
              <Stack gap="6">
                <OffboardingChecklist
                  memberId={employee.id}
                  canEdit={canEdit}
                  offboardDate={employee.offboardDate?.toISOString() ?? ''}
                />
                <EmploymentDocuments memberId={employee.id} eventType="offboard" canEdit={canEdit} />
              </Stack>
            </TabsContent>
          )}
          {showBackgroundCheck && (
            <TabsContent value="background-check">
              <EmployeeBackgroundCheck
                employee={employee}
                organizationId={orgId}
                initialBackgroundCheck={initialBackgroundCheck}
                initialBillingStatus={initialBackgroundCheckBillingStatus}
                backgroundCheckStepEnabled={backgroundCheckStepEnabled}
                memberBackgroundCheckExempt={memberExempt}
                onMemberBackgroundCheckExemptChange={setMemberExempt}
              />
            </TabsContent>
          )}
        </Stack>
      </Tabs>
    </PageLayout>
  );
}
