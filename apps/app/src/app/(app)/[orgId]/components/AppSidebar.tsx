'use client';

import { canAccessRoute, hasPermission, type UserPermissions } from '@/lib/permissions';
import type { Organization } from '@db';
import { useFeatureFlag } from '@trycompai/analytics';
import { AppShellNav, AppShellNavGroup, AppShellNavItem } from '@trycompai/design-system';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { GettingStartedNavFooter } from './GettingStartedNavFooter';
import { IsmsNavLinks } from './IsmsNavLinks';

interface NavItem {
  id: string;
  path: string;
  name: string;
  hidden?: boolean;
  /** Path prefixes owned by a more specific item, so this one is not highlighted there. */
  excludes?: string[];
  /** Highlight only under this exact path prefix instead of the top-level route segment. */
  matchPrefix?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
  /** Extra links resolved client-side (e.g. ISMS needs the ISO 27001 framework), shown after the first item. */
  extra?: React.ReactNode;
}

interface AppSidebarProps {
  organization: Organization;
  isQuestionnaireEnabled: boolean;
  hasAuditorRole: boolean;
  isOnlyAuditor: boolean;
  permissions: UserPermissions;
  /**
   * CS-189: Whether this user should see the Auditor View tab. Computed
   * server-side (see resolveAuditorViewAccess) because it needs to
   * distinguish owner/admin's implicit audit:read from a custom role's
   * explicit audit:read.
   */
  canAccessAuditorView: boolean;
}

/** PostHog flag gating the ISMS area (same as DocumentsPageTabs and documents/isms/layout). */
const ISMS_FEATURE_FLAG = 'is-isms-enabled';

export function AppSidebar({
  organization,
  isQuestionnaireEnabled,
  permissions,
  canAccessAuditorView,
}: AppSidebarProps) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const ismsFlagEnabled = useFeatureFlag(ISMS_FEATURE_FLAG);
  const base = `/${organization.id}`;
  const can = (route: string) => canAccessRoute(permissions, route);
  const showIsms =
    can('documents') && (ismsFlagEnabled === true || process.env.NODE_ENV === 'development');

  const isIsmsTab =
    showIsms && pathname === `${base}/documents` && searchParams?.get('tab') === 'iso-27001';

  const isActive = (item: NavItem) => {
    if (item.id === 'documents' && isIsmsTab) return false;
    if (item.excludes?.some((prefix) => pathname.startsWith(prefix))) return false;
    if (item.matchPrefix) return pathname.startsWith(item.path);
    const segment = (path: string) => path.split('/').filter(Boolean)[1] ?? '';
    return segment(item.path) === segment(pathname);
  };

  const groups: NavGroup[] = [
    {
      id: 'program',
      label: 'Program',
      items: [
        {
          id: 'overview',
          path: `${base}/overview`,
          name: 'Overview',
          hidden: !can('overview'),
          excludes: [`${base}/overview/findings`],
        },
        {
          id: 'frameworks',
          path: `${base}/frameworks`,
          name: 'Frameworks',
          hidden: !can('frameworks'),
        },
        { id: 'controls', path: `${base}/controls`, name: 'Controls', hidden: !can('controls') },
        { id: 'audits', path: `${base}/audits`, name: 'Audits', hidden: !can('audits') },
        // CS-189: built-in auditor role or a custom role that explicitly grants audit:read.
        {
          id: 'auditor',
          path: `${base}/auditor`,
          name: 'Auditor View',
          hidden: !canAccessAuditorView,
        },
      ],
    },
    {
      id: 'governance',
      label: 'Governance',
      items: [
        { id: 'policies', path: `${base}/policies`, name: 'Policies', hidden: !can('policies') },
        {
          id: 'findings',
          path: `${base}/overview/findings`,
          name: 'Findings',
          matchPrefix: true,
          hidden: !can('overview') || !hasPermission(permissions, 'finding', 'read'),
        },
        {
          id: 'questionnaire',
          path: `${base}/questionnaire`,
          name: 'Questionnaires',
          hidden: !isQuestionnaireEnabled || !can('questionnaire'),
        },
      ],
      extra: showIsms ? (
        <IsmsNavLinks organizationId={organization.id} pathname={pathname} isIsmsTab={isIsmsTab} />
      ) : null,
    },
    {
      id: 'evidence',
      label: 'Evidence',
      items: [
        { id: 'tasks', path: `${base}/tasks`, name: 'Evidence', hidden: !can('tasks') },
        {
          id: 'documents',
          path: `${base}/documents`,
          name: 'Documents',
          hidden: !can('documents'),
          excludes: [`${base}/documents/isms`, `${base}/documents/statement-of-applicability`],
        },
      ],
    },
    {
      id: 'risk',
      label: 'Risk',
      items: [
        { id: 'risk', path: `${base}/risk`, name: 'Risks', hidden: !can('risk') },
        { id: 'vendors', path: `${base}/vendors`, name: 'Vendors', hidden: !can('vendors') },
      ],
    },
    {
      id: 'personnel',
      label: 'Personnel',
      items: [{ id: 'people', path: `${base}/people/all`, name: 'People', hidden: !can('people') }],
    },
    {
      id: 'monitoring',
      label: 'Monitoring',
      items: [
        {
          id: 'integrations',
          path: `${base}/integrations`,
          name: 'Integrations',
          hidden: !can('integrations'),
        },
        {
          id: 'tests',
          path: `${base}/cloud-tests`,
          name: 'Cloud Tests',
          hidden: !can('cloud-tests'),
        },
        { id: 'assets', path: `${base}/assets`, name: 'Assets', hidden: !can('assets') },
        {
          id: 'vulnerabilities',
          path: `${base}/vulnerabilities`,
          name: 'Vulnerabilities',
          hidden: !can('vulnerabilities'),
        },
      ],
    },
  ];

  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.hidden) }))
    .filter((group) => group.items.length > 0 || group.extra);

  return (
    <>
      <AppShellNav>
        <div className="flex flex-col gap-4">
          {visibleGroups.map((group) => (
            <AppShellNavGroup key={group.id} label={group.label}>
              {group.items.slice(0, 1).map((item) => (
                <NavLink key={item.id} item={item} isActive={isActive(item)} />
              ))}
              {group.extra}
              {group.items.slice(1).map((item) => (
                <NavLink key={item.id} item={item} isActive={isActive(item)} />
              ))}
            </AppShellNavGroup>
          ))}
        </div>
      </AppShellNav>
      <GettingStartedNavFooter
        organizationId={organization.id}
        canManage={hasPermission(permissions, 'organization', 'update')}
        isActive={pathname.startsWith(`${base}/getting-started`)}
      />
    </>
  );
}

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Link href={item.path}>
      <AppShellNavItem isActive={isActive}>{item.name}</AppShellNavItem>
    </Link>
  );
}
