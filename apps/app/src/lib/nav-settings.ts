import { canAccessRoute, type UserPermissions } from './permissions';

/** Settings pages, shared by the settings sidebar and the ⌘K palette. */
export interface SettingsNavItem {
  id: string;
  label: string;
  path: string;
  segment: string;
  keywords: string[];
  feature?: 'billing' | 'browser';
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    id: 'general',
    label: 'General',
    path: '/settings',
    segment: 'settings',
    keywords: ['organization', 'company details', 'legal name', 'address'],
  },
  {
    id: 'billing',
    label: 'Billing',
    path: '/settings/billing',
    segment: 'settings',
    feature: 'billing',
    keywords: ['subscription', 'invoice'],
  },
  {
    id: 'context',
    label: 'Context',
    path: '/settings/context-hub',
    segment: 'settings/context-hub',
    keywords: ['context hub', 'knowledge'],
  },
  {
    id: 'api',
    label: 'API Keys',
    path: '/settings/api-keys',
    segment: 'settings/api-keys',
    keywords: ['api', 'tokens'],
  },
  {
    id: 'secrets',
    label: 'Secrets',
    path: '/settings/secrets',
    segment: 'settings/secrets',
    keywords: ['credentials'],
  },
  {
    id: 'roles',
    label: 'Roles',
    path: '/settings/roles',
    segment: 'settings/roles',
    keywords: ['rbac', 'permissions', 'custom roles'],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    path: '/settings/notifications',
    segment: 'settings/notifications',
    keywords: ['email', 'alerts'],
  },
  {
    id: 'security',
    label: 'Security',
    path: '/settings/security',
    segment: 'settings/security',
    keywords: ['sso', 'sign-in methods', 'session timeout', 'mfa'],
  },
  {
    id: 'event-log',
    label: 'Event log',
    path: '/settings/event-log',
    segment: 'settings/event-log',
    keywords: ['audit log', 'activity', 'history'],
  },
  {
    id: 'browser',
    label: 'Browser connections',
    path: '/settings/browser-connection',
    segment: 'settings/browser-connection',
    feature: 'browser',
    keywords: ['browser automation'],
  },
  {
    id: 'user',
    label: 'User Settings',
    path: '/settings/user',
    segment: 'settings/user',
    keywords: ['email preferences', 'notifications', 'profile'],
  },
];

export function visibleSettingsItems({
  permissions,
  features,
}: {
  /** Omitted: no RBAC filtering (callers that only gate on the page itself). */
  permissions?: UserPermissions;
  features: Partial<Record<'billing' | 'browser', boolean>>;
}): SettingsNavItem[] {
  return SETTINGS_NAV_ITEMS.filter(
    (i) =>
      (!permissions || canAccessRoute(permissions, i.segment)) &&
      (!i.feature || features[i.feature] === true),
  );
}
