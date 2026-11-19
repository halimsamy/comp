'use client';

import { activeNavItemId } from '@/lib/nav';
import { visibleSettingsItems } from '@/lib/nav-settings';
import type { UserPermissions } from '@/lib/permissions';
import { AppShellNav, AppShellNavItem } from '@trycompai/design-system';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SettingsSidebarProps {
  orgId: string;
  showBrowserTab: boolean;
  showBillingTab?: boolean;
  /** Omitted: show every page (permission checks still happen on each page). */
  permissions?: UserPermissions;
}

/** Settings pages from the nav registry (lib/nav-settings.ts), gated like their routes. */
export function SettingsSidebar({
  orgId,
  showBrowserTab,
  showBillingTab,
  permissions,
}: SettingsSidebarProps) {
  const pathname = usePathname() ?? '';
  const items = visibleSettingsItems({
    permissions,
    features: { billing: !!showBillingTab, browser: showBrowserTab },
  });
  const activeId = activeNavItemId({ items, orgId, pathname, search: null });

  return (
    <AppShellNav>
      {items.map((item) => (
        <Link key={item.id} href={`/${orgId}${item.path}`}>
          <AppShellNavItem isActive={item.id === activeId}>{item.label}</AppShellNavItem>
        </Link>
      ))}
    </AppShellNav>
  );
}
