import { db } from '@db';

export type TrustFrameworkKey =
  | 'iso27001'
  | 'iso42001'
  | 'gdpr'
  | 'hipaa'
  | 'soc2type1'
  | 'soc2type2'
  | 'soc3'
  | 'pcidss'
  | 'nen7510'
  | 'iso9001'
  | 'pipeda'
  | 'ccpa';

export type LiveFrameworkStatus = 'in_progress' | 'compliant';

/** Maps a framework catalog name ("ISO 27001", "PCI DSS Level 1", "SOC 2 Type II") to a trust portal key. */
export function trustKeyForFramework(name: string): TrustFrameworkKey | null {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (n.startsWith('iso27001')) return 'iso27001';
  if (n.startsWith('iso42001')) return 'iso42001';
  if (n.startsWith('iso9001')) return 'iso9001';
  if (n.startsWith('pcidss')) return 'pcidss';
  if (n.startsWith('nen7510')) return 'nen7510';
  if (n.startsWith('soc3')) return 'soc3';
  if (n.startsWith('soc2')) {
    return n.includes('type1') || n.endsWith('typei')
      ? 'soc2type1'
      : 'soc2type2';
  }
  for (const key of ['gdpr', 'hipaa', 'pipeda', 'ccpa'] as const) {
    if (n.startsWith(key)) return key;
  }
  return null;
}

// A completed audit only backs a "Compliant" claim for a year: PCI DSS ROC/AOC
// is annual and ISO 27001 certificates need a yearly surveillance audit.
const AUDIT_VALID_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * What the org's live program says about each trust framework: "in_progress"
 * once the framework is added, "compliant" once a completed audit covers it.
 */
export async function liveFrameworkStatus(
  organizationId: string,
  now: Date = new Date(),
): Promise<Partial<Record<TrustFrameworkKey, LiveFrameworkStatus>>> {
  const instances = await db.frameworkInstance.findMany({
    where: { organizationId },
    select: {
      framework: { select: { name: true } },
      auditEngagements: {
        where: {
          organizationId,
          status: 'completed',
          periodEnd: { gte: new Date(now.getTime() - AUDIT_VALID_MS) },
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  const result: Partial<Record<TrustFrameworkKey, LiveFrameworkStatus>> = {};
  for (const instance of instances) {
    if (!instance.framework) continue;
    const key = trustKeyForFramework(instance.framework.name);
    if (!key) continue;
    const status =
      instance.auditEngagements.length > 0 ? 'compliant' : 'in_progress';
    if (result[key] !== 'compliant') result[key] = status;
  }
  return result;
}
