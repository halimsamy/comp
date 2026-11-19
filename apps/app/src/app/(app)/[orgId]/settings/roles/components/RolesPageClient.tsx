'use client';

import { Section, Stack, Tabs, TabsContent, TabsList, TabsTrigger } from '@trycompai/design-system';
import { useRoles } from '../hooks/useRoles';
import Loading from '../loading';
import { RolePermissionMatrix } from './RolePermissionMatrix';
import type { CustomRole } from './RolesTable';
import { RolesTable } from './RolesTable';
import { SystemRolesTable } from './SystemRoles';

interface RolesPageClientProps {
  initialData: CustomRole[];
  /** Active members per built-in role name. */
  systemMemberCounts?: Record<string, number>;
}

export function RolesPageClient({ initialData, systemMemberCounts }: RolesPageClientProps) {
  const { roles, isLoading } = useRoles({
    initialData,
  });

  if (isLoading) {
    return <Loading />;
  }

  return (
    <Tabs defaultValue="roles">
      <TabsList>
        <TabsTrigger value="roles">Roles</TabsTrigger>
        <TabsTrigger value="matrix">Permission matrix</TabsTrigger>
      </TabsList>
      <TabsContent value="roles">
        <div className="pt-4">
          <Stack gap="xl">
            <Section
              title="System Roles"
              description="Built-in roles with predefined permissions. These cannot be modified."
            >
              <SystemRolesTable memberCounts={systemMemberCounts} />
            </Section>

            <Section
              title="Custom Roles"
              description="Create custom roles with specific permissions tailored to your organization."
            >
              <RolesTable roles={roles} />
            </Section>
          </Stack>
        </div>
      </TabsContent>
      <TabsContent value="matrix">
        <div className="pt-4">
          <RolePermissionMatrix customRoles={roles} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
