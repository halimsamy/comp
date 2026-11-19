'use client';

import {
  canAccessCompliance,
  canAccessRoute,
  hasPermission,
  type UserPermissions,
} from '@/lib/permissions';
import { AppShellRail } from '@trycompai/design-system';
import { Badge, Globe, Locked, ManageProtection, Settings } from '@trycompai/design-system/icons';
import { ShellRailNavItem } from './ShellRailNavItem';

export type ShellSection = 'Compliance' | 'Trust' | 'Security' | 'Settings' | 'Admin';

/** Product rail: one icon per product the member can open. */
export function AppRail({
  orgId,
  permissions,
  section,
  showTrust,
  showSecurity,
  showSettings,
  isAdmin,
}: {
  orgId: string;
  permissions: UserPermissions;
  section: ShellSection;
  showTrust: boolean;
  showSecurity: boolean;
  showSettings: boolean;
  isAdmin: boolean;
}) {
  return (
    <AppShellRail>
      {canAccessCompliance(permissions) && (
        <ShellRailNavItem
          href={`/${orgId}/overview`}
          isActive={section === 'Compliance'}
          icon={<Badge className="size-5" />}
          label="Compliance"
        />
      )}
      {showTrust && hasPermission(permissions, 'trust', 'read') && (
        <ShellRailNavItem
          href={`/${orgId}/trust`}
          isActive={section === 'Trust'}
          icon={<Globe className="size-5" />}
          label="Trust"
        />
      )}
      {showSecurity && canAccessRoute(permissions, 'penetration-tests') && (
        <ShellRailNavItem
          href={`/${orgId}/security`}
          isActive={section === 'Security'}
          icon={<ManageProtection className="size-5" />}
          label="Security"
        />
      )}
      {showSettings && (
        <ShellRailNavItem
          href={`/${orgId}/settings`}
          isActive={section === 'Settings'}
          icon={<Settings className="size-5" />}
          label="Settings"
        />
      )}
      {isAdmin && (
        <ShellRailNavItem
          href={`/${orgId}/admin`}
          isActive={section === 'Admin'}
          icon={<Locked className="size-5" />}
          label="Admin"
        />
      )}
    </AppShellRail>
  );
}
