import { canAccessRoute, type UserPermissions } from '@/lib/permissions';
import {
  Catalog,
  Chemistry,
  Dashboard,
  Document,
  Group,
  Integration,
  ListChecked,
  Policy,
  Rocket,
  Security,
  Settings,
  ShoppingBag,
  Task,
  TaskComplete,
  Warning,
} from '@carbon/icons-react';
import type { CommandSearchGroup } from '@trycompai/design-system';
import type { ReactNode } from 'react';

interface AppShellSearchGroupsParams {
  organizationId: string;
  router: {
    push: (href: string) => void;
  };
  permissions: UserPermissions;
  hasAuditorRole: boolean;
  isOnlyAuditor: boolean;
  /** CS-189: resolved server-side — see AppShellWrapper. */
  canAccessAuditorView: boolean;
  isQuestionnaireEnabled: boolean;
  isTrustNdaEnabled: boolean;
  isSecurityEnabled: boolean;
  isAdvancedModeEnabled: boolean;
}

interface NavigationItemParams {
  id: string;
  label: string;
  icon: ReactNode;
  path: string;
  keywords: string[];
  router: {
    push: (href: string) => void;
  };
}

const createNavItem = ({
  id,
  label,
  icon,
  path,
  keywords,
  router,
}: NavigationItemParams): CommandSearchGroup['items'][number] => ({
  id,
  label,
  icon,
  keywords,
  onSelect: () => router.push(path),
});

export const getAppShellSearchGroups = ({
  organizationId,
  router,
  permissions,
  hasAuditorRole,
  isOnlyAuditor,
  canAccessAuditorView,
  isQuestionnaireEnabled,
  isTrustNdaEnabled,
  isSecurityEnabled,
  isAdvancedModeEnabled,
}: AppShellSearchGroupsParams): CommandSearchGroup[] => {
  const can = (route: string) => canAccessRoute(permissions, route);

  const pages: Array<Omit<NavigationItemParams, 'router'> & { visible: boolean }> = [
    {
      visible: can('getting-started'),
      id: 'getting-started',
      label: 'Getting started',
      icon: <Rocket size={16} />,
      path: `/${organizationId}/getting-started`,
      keywords: ['setup', 'onboarding', 'checklist', 'guide', 'progress'],
    },
    {
      visible: can('overview'),
      id: 'overview',
      label: 'Overview',
      icon: <Dashboard size={16} />,
      path: `/${organizationId}/overview`,
      keywords: ['dashboard', 'home', 'overview'],
    },
    {
      visible: can('frameworks'),
      id: 'frameworks',
      label: 'Frameworks',
      icon: <Security size={16} />,
      path: `/${organizationId}/frameworks`,
      keywords: ['frameworks', 'compliance', 'standards'],
    },
    {
      visible: can('controls'),
      id: 'controls',
      label: 'Controls',
      icon: <Catalog size={16} />,
      path: `/${organizationId}/controls`,
      keywords: ['controls', 'annex a', 'requirements', 'mapping'],
    },
    // CS-189: gate on the server-resolved canAccessAuditorView flag so
    // owner/admin are hidden unless they explicitly opt in via a custom role.
    {
      visible: canAccessAuditorView,
      id: 'auditor',
      label: 'Auditor View',
      icon: <TaskComplete size={16} />,
      path: `/${organizationId}/auditor`,
      keywords: ['audit', 'review'],
    },
    {
      visible: can('policies'),
      id: 'policies',
      label: 'Policies',
      icon: <Policy size={16} />,
      path: `/${organizationId}/policies`,
      keywords: ['policy', 'documents'],
    },
    {
      visible: can('tasks'),
      id: 'evidence',
      label: 'Evidence',
      icon: <ListChecked size={16} />,
      path: `/${organizationId}/tasks`,
      keywords: ['tasks', 'evidence', 'artifacts'],
    },
    {
      visible: isTrustNdaEnabled && can('trust'),
      id: 'trust',
      label: 'Trust',
      icon: <Task size={16} />,
      path: `/${organizationId}/trust`,
      keywords: ['trust center', 'portal'],
    },
    {
      visible: isSecurityEnabled && can('penetration-tests'),
      id: 'security',
      label: 'Security',
      icon: <Security size={16} />,
      path: `/${organizationId}/security`,
      keywords: ['security', 'vulnerability', 'reports'],
    },
    {
      visible: can('documents'),
      id: 'documents',
      label: 'Documents',
      icon: <Catalog size={16} />,
      path: `/${organizationId}/documents`,
      keywords: ['company', 'tasks', 'forms', 'evidence submissions', 'documents'],
    },
    {
      visible: can('people'),
      id: 'people',
      label: 'People',
      icon: <Group size={16} />,
      path: `/${organizationId}/people/all`,
      keywords: ['users', 'team', 'members', 'employees'],
    },
    {
      visible: can('risk'),
      id: 'risks',
      label: 'Risks',
      icon: <Warning size={16} />,
      path: `/${organizationId}/risk`,
      keywords: ['risk management', 'assessment'],
    },
    {
      visible: can('vendors'),
      id: 'vendors',
      label: 'Vendors',
      icon: <ShoppingBag size={16} />,
      path: `/${organizationId}/vendors`,
      keywords: ['suppliers', 'third party'],
    },
    {
      visible: isQuestionnaireEnabled && can('questionnaire'),
      id: 'questionnaire',
      label: 'Questionnaire',
      icon: <Document size={16} />,
      path: `/${organizationId}/questionnaire`,
      keywords: ['survey', 'questions'],
    },
    {
      visible: !isOnlyAuditor && can('integrations'),
      id: 'integrations',
      label: 'Integrations',
      icon: <Integration size={16} />,
      path: `/${organizationId}/integrations`,
      keywords: ['connect', 'apps', 'services'],
    },
    {
      visible: can('cloud-tests'),
      id: 'cloud-tests',
      label: 'Cloud Tests',
      icon: <Chemistry size={16} />,
      path: `/${organizationId}/cloud-tests`,
      keywords: ['testing', 'cloud', 'infrastructure'],
    },
  ];
  const baseItems = pages
    .filter((page) => page.visible)
    .map(({ visible: _visible, ...page }) => createNavItem({ ...page, router }));

  return [
    ...(baseItems.length > 0
      ? [
          {
            id: 'navigation',
            label: 'Navigation',
            items: baseItems,
          },
        ]
      : []),
    ...(!isOnlyAuditor && can('settings')
      ? [
          {
            id: 'settings',
            label: 'Settings',
            items: [
              createNavItem({
                id: 'settings-general',
                label: 'General Settings',
                icon: <Settings size={16} />,
                path: `/${organizationId}/settings`,
                keywords: ['preferences', 'configuration'],
                router,
              }),
            ],
          },
        ]
      : []),
  ];
};
