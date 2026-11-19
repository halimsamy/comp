import { canAccessRoute, hasPermission, type UserPermissions } from './permissions';

/**
 * Single registry of the app's pages. The compliance sidebar, the settings
 * sidebar and the ⌘K palette all render from it, so a page added here shows up
 * everywhere with the same label, permission and URL.
 */

export type NavGroupId =
  | 'program'
  | 'governance'
  | 'evidence'
  | 'risk'
  | 'personnel'
  | 'monitoring'
  /** Palette only: the sidebar shows setup progress in its footer instead. */
  | 'setup'
  /** Palette only: other products reached from the rail. */
  | 'products';

/** Runtime conditions beyond RBAC (feature flags, org state). */
export type NavFeature = 'questionnaire' | 'isms' | 'setup' | 'trust' | 'security';
export type NavFeatures = Partial<Record<NavFeature, boolean>>;

export interface NavItem {
  id: string;
  label: string;
  /** Org-relative path, may carry a query (e.g. `/people?tab=access`). */
  path: string;
  /** ROUTE_PERMISSIONS key that gates the page. */
  segment: string;
  group: NavGroupId;
  keywords: string[];
  /** Extra permission on top of the route's. */
  permission?: { resource: string; action: string };
  feature?: NavFeature;
  /** Other org-relative paths (or path?query) that belong to this item, for highlighting. */
  match?: string[];
}

export const NAV_GROUPS: Array<{ id: NavGroupId; label: string }> = [
  { id: 'program', label: 'Program' },
  { id: 'governance', label: 'Governance' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'risk', label: 'Risk' },
  { id: 'personnel', label: 'Personnel' },
  { id: 'monitoring', label: 'Monitoring' },
];

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'getting-started',
    label: 'Getting started',
    path: '/getting-started',
    segment: 'getting-started',
    group: 'setup',
    feature: 'setup',
    keywords: ['setup', 'onboarding', 'checklist', 'guide', 'progress'],
  },
  {
    id: 'overview',
    label: 'Overview',
    path: '/overview',
    segment: 'overview',
    group: 'program',
    keywords: ['dashboard', 'home'],
  },
  {
    id: 'frameworks',
    label: 'Frameworks',
    path: '/frameworks',
    segment: 'frameworks',
    group: 'program',
    keywords: ['compliance', 'standards', 'iso 27001', 'pci dss'],
  },
  {
    id: 'controls',
    label: 'Controls',
    path: '/controls',
    segment: 'controls',
    group: 'program',
    keywords: ['annex a', 'requirements', 'mapping'],
  },
  {
    id: 'audits',
    label: 'Audits',
    path: '/audits',
    segment: 'audits',
    group: 'program',
    keywords: ['audit', 'auditor', 'engagement', 'evidence requests', 'certification'],
  },
  {
    id: 'policies',
    label: 'Policies',
    path: '/policies',
    segment: 'policies',
    group: 'governance',
    keywords: ['policy', 'documents', 'approval'],
  },
  {
    id: 'isms',
    label: 'ISMS',
    path: '/documents/isms',
    segment: 'documents',
    group: 'governance',
    feature: 'isms',
    match: ['/documents?tab=iso-27001'],
    keywords: ['iso 27001', 'clauses 4-10', 'scope', 'objectives', 'management review'],
  },
  {
    id: 'soa',
    label: 'Statement of Applicability',
    path: '/documents/statement-of-applicability',
    segment: 'documents',
    group: 'governance',
    feature: 'isms',
    keywords: ['soa', 'annex a', '6.1.3'],
  },
  {
    id: 'findings',
    label: 'Findings',
    path: '/audits?tab=findings',
    segment: 'audits',
    group: 'governance',
    permission: { resource: 'finding', action: 'read' },
    keywords: ['nonconformity', 'nonconformities', 'issues', 'corrective action'],
  },
  {
    id: 'questionnaire',
    label: 'Questionnaires',
    path: '/questionnaire',
    segment: 'questionnaire',
    group: 'governance',
    feature: 'questionnaire',
    keywords: ['security questionnaire', 'survey', 'knowledge base'],
  },
  {
    id: 'tasks',
    label: 'Evidence',
    path: '/tasks',
    segment: 'tasks',
    group: 'evidence',
    keywords: ['tasks', 'evidence', 'artifacts'],
  },
  {
    id: 'documents',
    label: 'Documents',
    path: '/documents',
    segment: 'documents',
    group: 'evidence',
    keywords: ['company', 'forms', 'evidence submissions'],
  },
  {
    id: 'risk',
    label: 'Risks',
    path: '/risk',
    segment: 'risk',
    group: 'risk',
    keywords: ['risk management', 'assessment', 'register'],
  },
  {
    id: 'vendors',
    label: 'Vendors',
    path: '/vendors',
    segment: 'vendors',
    group: 'risk',
    keywords: ['suppliers', 'third party', 'tpsp'],
  },
  {
    id: 'people',
    label: 'People',
    path: '/people',
    segment: 'people',
    group: 'personnel',
    keywords: ['users', 'team', 'members', 'employees'],
  },
  {
    id: 'access-reviews',
    label: 'Access reviews',
    path: '/people?tab=access',
    segment: 'people',
    group: 'personnel',
    match: ['/people/access'],
    keywords: ['access review', 'user access', 'accounts', 'recertification'],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    path: '/integrations',
    segment: 'integrations',
    group: 'monitoring',
    keywords: ['connect', 'apps', 'services'],
  },
  {
    id: 'cloud-tests',
    label: 'Cloud Tests',
    path: '/cloud-tests',
    segment: 'cloud-tests',
    group: 'monitoring',
    keywords: ['testing', 'cloud', 'infrastructure'],
  },
  {
    id: 'assets',
    label: 'Assets',
    path: '/assets',
    segment: 'assets',
    group: 'monitoring',
    keywords: ['inventory', 'devices', 'servers', 'systems'],
  },
  {
    id: 'vulnerabilities',
    label: 'Vulnerabilities',
    path: '/vulnerabilities',
    segment: 'vulnerabilities',
    group: 'monitoring',
    keywords: ['vulnerability', 'cve', 'scan', 'sla', 'remediation'],
  },
  {
    id: 'trust',
    label: 'Trust',
    path: '/trust',
    segment: 'trust',
    group: 'products',
    feature: 'trust',
    keywords: ['trust center', 'portal'],
  },
  {
    id: 'security',
    label: 'Security',
    path: '/security',
    segment: 'penetration-tests',
    group: 'products',
    feature: 'security',
    keywords: ['penetration test', 'pentest', 'reports'],
  },
];

export function visibleNavItems({
  permissions,
  features,
}: {
  permissions: UserPermissions;
  features: NavFeatures;
}): NavItem[] {
  return NAV_ITEMS.filter(
    (i) =>
      canAccessRoute(permissions, i.segment) &&
      (!i.permission || hasPermission(permissions, i.permission.resource, i.permission.action)) &&
      (!i.feature || features[i.feature] === true),
  );
}

/**
 * The id of the one item to highlight: an exact path+query match wins, then the
 * longest path prefix (so /overview/findings highlights Findings, not Overview).
 */
export function activeNavItemId({
  items,
  orgId,
  pathname,
  search,
}: {
  items: Array<Pick<NavItem, 'id' | 'path' | 'match'>>;
  orgId: string;
  pathname: string;
  search: URLSearchParams | null;
}): string | null {
  let best: { id: string; score: number } | null = null;
  for (const i of items) {
    for (const candidate of [i.path, ...(i.match ?? [])]) {
      const [path, query] = candidate.split('?');
      const full = `/${orgId}${path}`;
      let score = -1;
      if (query) {
        const wanted = new URLSearchParams(query);
        const all = [...wanted.entries()].every(([k, v]) => search?.get(k) === v);
        if (pathname === full && all) score = 10_000;
      } else if (pathname === full || pathname.startsWith(`${full}/`)) {
        score = full.length;
      }
      if (score >= 0 && (!best || score > best.score)) best = { id: i.id, score };
    }
  }
  return best?.id ?? null;
}
