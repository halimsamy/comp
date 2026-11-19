import { visibleNavItems, type NavFeatures } from '@/lib/nav';
import { visibleSettingsItems } from '@/lib/nav-settings';
import { canAccessRoute, type UserPermissions } from '@/lib/permissions';
import type { CommandSearchGroup } from '@trycompai/design-system';
import {
  Badge,
  Book,
  Catalog,
  Chemistry,
  Dashboard,
  DataBase,
  Document,
  Group,
  Integration,
  ListChecked,
  Policy,
  Rocket,
  Security,
  Settings,
  ShoppingBag,
  Table,
  Task,
  TaskComplete,
  UserAccess,
  Warning,
  WarningAlt,
} from '@trycompai/design-system/icons';
import type { ReactNode } from 'react';

const ICONS: Record<string, ReactNode> = {
  'getting-started': <Rocket size={16} />,
  overview: <Dashboard size={16} />,
  frameworks: <Security size={16} />,
  controls: <Catalog size={16} />,
  audits: <TaskComplete size={16} />,
  policies: <Policy size={16} />,
  isms: <Book size={16} />,
  soa: <Table size={16} />,
  findings: <WarningAlt size={16} />,
  questionnaire: <Document size={16} />,
  tasks: <ListChecked size={16} />,
  documents: <Catalog size={16} />,
  risk: <Warning size={16} />,
  vendors: <ShoppingBag size={16} />,
  people: <Group size={16} />,
  'access-reviews': <UserAccess size={16} />,
  integrations: <Integration size={16} />,
  'cloud-tests': <Chemistry size={16} />,
  assets: <DataBase size={16} />,
  vulnerabilities: <Badge size={16} />,
  trust: <Task size={16} />,
  security: <Security size={16} />,
};

/** Static palette groups: every page from the nav registry plus the settings pages. */
export const getAppShellSearchGroups = ({
  organizationId,
  router,
  permissions,
  features,
  isOnlyAuditor,
  showBillingTab,
  showBrowserTab,
}: {
  organizationId: string;
  router: { push: (href: string) => void };
  permissions: UserPermissions;
  features: NavFeatures;
  isOnlyAuditor: boolean;
  showBillingTab: boolean;
  showBrowserTab: boolean;
}): CommandSearchGroup[] => {
  const base = `/${organizationId}`;
  const pages = visibleNavItems({ permissions, features }).map((item) => ({
    id: `page:${item.id}`,
    label: item.label,
    icon: ICONS[item.id],
    keywords: item.keywords,
    onSelect: () => router.push(`${base}${item.path}`),
  }));
  const settings =
    !isOnlyAuditor && canAccessRoute(permissions, 'settings')
      ? visibleSettingsItems({
          permissions,
          features: { billing: showBillingTab, browser: showBrowserTab },
        }).map((item) => ({
          id: `settings:${item.id}`,
          // "Security" and "General" alone would be ambiguous next to the pages.
          label: item.id === 'user' ? item.label : `${item.label} settings`,
          icon: <Settings size={16} />,
          keywords: ['settings', ...item.keywords],
          onSelect: () => router.push(`${base}${item.path}`),
        }))
      : [];

  return [
    ...(pages.length > 0 ? [{ id: 'navigation', label: 'Navigation', items: pages }] : []),
    ...(settings.length > 0 ? [{ id: 'settings', label: 'Settings', items: settings }] : []),
  ];
};
