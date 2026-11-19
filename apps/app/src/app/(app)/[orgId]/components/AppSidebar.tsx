'use client';

import { activeNavItemId, NAV_GROUPS, visibleNavItems, type NavFeatures } from '@/lib/nav';
import { hasPermission, type UserPermissions } from '@/lib/permissions';
import { AppShellNav, AppShellNavGroup, AppShellNavItem } from '@trycompai/design-system';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { GettingStartedNavFooter } from './GettingStartedNavFooter';

interface AppSidebarProps {
  organizationId: string;
  permissions: UserPermissions;
  features: NavFeatures;
}

/** Compliance sidebar, rendered from the nav registry (lib/nav.ts). */
export function AppSidebar({ organizationId, permissions, features }: AppSidebarProps) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const base = `/${organizationId}`;

  const items = visibleNavItems({ permissions, features });
  const activeId = activeNavItemId({
    items,
    orgId: organizationId,
    pathname,
    search: searchParams,
  });
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => item.group === group.id),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      {/* Scrolls on short viewports so the last items and the setup footer stay reachable. */}
      <div data-testid="app-sidebar-scroll" className="min-h-0 flex-1 overflow-y-auto">
        <AppShellNav>
          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <AppShellNavGroup key={group.id} label={group.label}>
                {group.items.map((item) => (
                  <Link key={item.id} href={`${base}${item.path}`}>
                    <AppShellNavItem isActive={item.id === activeId}>{item.label}</AppShellNavItem>
                  </Link>
                ))}
              </AppShellNavGroup>
            ))}
          </div>
        </AppShellNav>
      </div>
      <GettingStartedNavFooter
        organizationId={organizationId}
        canManage={hasPermission(permissions, 'organization', 'update')}
        isActive={pathname.startsWith(`${base}/getting-started`)}
      />
    </>
  );
}
