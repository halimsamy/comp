export type ChecklistItemStatus = 'todo' | 'done' | 'locked' | 'skipped';

// A type alias (not an interface) so it stays assignable to Prisma's JSON input type.
export type ChecklistSkip = {
  reason: string;
  skippedAt: string;
  skippedById: string | null;
};

export type ChecklistSkips = Record<string, ChecklistSkip>;

/** Live org state the Getting Started guide is computed from. Nothing here is stored for the guide. */
export interface ChecklistState {
  hasIso27001: boolean;
  hasPciDss: boolean;
  frameworkCount: number;
  hasLogo: boolean;
  hasWebsite: boolean;
  /** Organization.sessionIdleTimeoutMinutes (null = off). */
  idleTimeoutMinutes: number | null;
  controls: { total: number; owned: number };
  assets: { total: number; scoped: number };
  ismsProfileCompleted: boolean;
  /** Categories of the org's active integration connections (e.g. 'Cloud', 'Identity & Access'). */
  connectedCategories: string[];
  hasLegacyCloudIntegration: boolean;
  /** Device agent check-ins or a Fleet label for the org. */
  hasDeviceSource: boolean;
  policies: {
    total: number;
    published: number;
    firstUnpublishedId: string | null;
  };
  acknowledgements: { members: number; fullySigned: number };
  ismsDocuments: { total: number; approved: number };
  soaApproved: boolean;
  pciScopeTask: { id: string; done: boolean } | null;
  activeMembers: number;
  risks: { total: number; assessed: number; withAcceptance: number };
  vendors: { total: number; assessed: number; classified: number };
  /** Non-archived tasks; not relevant ones are out of `total` (countTaskProgress). */
  tasks: { total: number; complete: number; notRelevant: number };
  evidenceSubmissions: number;
  /** An audit engagement has an auditor (or a pending invite), or an auditor member exists. */
  auditorInvited: boolean;
  skips: ChecklistSkips;
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  status: ChecklistItemStatus;
  /** App path relative to the org, e.g. `/policies` (the client prefixes `/{orgId}`). */
  href: string;
  ctaLabel: string;
  /** Requirement references this step evidences, e.g. `ISO 27001 6.1.3`. */
  references: string[];
  dependsOn: string[];
  lockedReason: string | null;
  progress: { done: number; total: number } | null;
  skip: ChecklistSkip | null;
  /** False for steps an ISO 27001 / PCI DSS audit cannot do without (SoA, ISMS documents, PCI scope). */
  skippable: boolean;
}

export interface ChecklistSection {
  id: string;
  title: string;
  description: string;
  items: ChecklistItem[];
  completed: number;
  total: number;
}

export interface OnboardingChecklist {
  sections: ChecklistSection[];
  completed: number;
  total: number;
  percent: number;
  isComplete: boolean;
}
