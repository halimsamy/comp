import type { ChecklistItemSpec } from './checklist-items';
import type { ChecklistState } from './checklist-types';

/** PCI DSS 8.2.8: sessions idle for more than 15 minutes require re-authentication. */
export const MAX_IDLE_TIMEOUT_MINUTES = 15;

const ratio = (done: number, total: number) => ({ done, total });

export function idleTimeoutSpec(s: ChecklistState): ChecklistItemSpec {
  return {
    id: 'idle_timeout',
    section: 'program',
    title: `Set the idle session timeout to ${MAX_IDLE_TIMEOUT_MINUTES} minutes`,
    description:
      'Signs people out of CompAI after 15 idle minutes, as PCI DSS requires for system components.',
    href: '/settings/security',
    ctaLabel: 'Open security settings',
    references: ['PCI DSS 8.2.8', 'ISO 27001 A.8.5'],
    done:
      s.idleTimeoutMinutes !== null &&
      s.idleTimeoutMinutes <= MAX_IDLE_TIMEOUT_MINUTES,
  };
}

export function controlOwnersSpec(s: ChecklistState): ChecklistItemSpec {
  return {
    id: 'control_owners',
    section: 'program',
    title: 'Assign control owners',
    description:
      'Every control needs an accountable owner. Select several controls to assign them at once.',
    href: '/controls',
    ctaLabel: 'Go to controls',
    references: ['ISO 27001 5.3', 'PCI DSS 12.4.1'],
    done: s.controls.total > 0 && s.controls.owned === s.controls.total,
    lockedReason:
      s.controls.total === 0 ? 'Add a framework to create controls first.' : null,
    progress: ratio(s.controls.owned, s.controls.total),
  };
}

export function assetsScopedSpec(s: ChecklistState): ChecklistItemSpec {
  return {
    id: 'assets_scoped',
    section: 'isms',
    title: 'Scope your assets',
    description:
      'Mark each system in your inventory as in the CDE, connected to it or out of scope.',
    href: '/assets',
    ctaLabel: 'Go to assets',
    references: ['ISO 27001 A.5.9', 'PCI DSS 12.5.1', 'PCI DSS 12.5.2'],
    done: s.assets.total > 0 && s.assets.scoped === s.assets.total,
    progress: ratio(s.assets.scoped, s.assets.total),
  };
}

export function vendorsClassifiedSpec(s: ChecklistState): ChecklistItemSpec {
  return {
    id: 'vendors_classified',
    section: 'risk',
    title: 'Classify your vendors',
    description:
      'Set the criticality of each vendor so the critical ones get a yearly review.',
    href: '/vendors?criticality=unset',
    ctaLabel: 'Classify vendors',
    references: ['ISO 27001 A.5.19', 'PCI DSS 12.8.1'],
    done: s.vendors.total > 0 && s.vendors.classified === s.vendors.total,
    lockedReason: s.vendors.total === 0 ? 'Add your vendors first.' : null,
    progress: ratio(s.vendors.classified, s.vendors.total),
  };
}
