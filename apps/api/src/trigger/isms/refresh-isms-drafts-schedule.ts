import { db } from '@db';
import type { IsmsDocumentType } from '@db';
import { logger, schedules } from '@trycompai/jobs';
import { collectPlatformData } from '../../isms/documents/data-source';
import { runDerivation } from '../../isms/documents/generate';
import {
  diffPlatformSnapshots,
  parsePlatformSnapshot,
} from '../../isms/documents/snapshot';
import { lockDocument } from '../../isms/utils/document-lock';
import { updateDraftSnapshot } from '../../isms/utils/draft-snapshot';

/**
 * Registers whose rows are re-derived from platform data (upsertDerivedRows keeps
 * manual and edited rows). Narrative documents are seeded once, so refreshing
 * their baseline would only hide the drift flag from the person who must review
 * them. Listed in generation order: requirements read the parties register.
 */
const REFRESHED_TYPES: IsmsDocumentType[] = [
  'context_of_organization',
  'interested_parties_register',
  'interested_parties_requirements',
  'objectives_plan',
];

/** Approved and pending-approval documents are never touched. */
const EDITABLE_STATUSES = ['draft', 'declined'] as const;

type DraftDocument = {
  id: string;
  organizationId: string;
  frameworkId: string;
  type: IsmsDocumentType;
  draftSnapshot: Parameters<typeof parsePlatformSnapshot>[0];
};

/**
 * Daily: re-derive draft ISMS registers whose platform facts drifted (People,
 * Vendors, devices, frameworks...), so 4.1 never keeps stale copies of counts.
 */
export async function refreshIsmsDraftsForAllOrgs() {
  const documents = await db.ismsDocument.findMany({
    where: {
      type: { in: REFRESHED_TYPES },
      status: { in: [...EDITABLE_STATUSES] },
    },
    select: {
      id: true,
      organizationId: true,
      frameworkId: true,
      type: true,
      draftSnapshot: true,
    },
  });

  const groups = new Map<string, DraftDocument[]>();
  for (const document of documents) {
    const key = `${document.organizationId}:${document.frameworkId}`;
    groups.set(key, [...(groups.get(key) ?? []), document]);
  }

  let refreshed = 0;
  for (const group of groups.values()) {
    try {
      refreshed += await refreshGroup(group);
    } catch (error) {
      // One org's failure must not stop the others.
      logger.error('Failed to refresh ISMS drafts', {
        organizationId: group[0].organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.info('Refreshed drifted ISMS drafts', {
    documents: documents.length,
    refreshed,
  });
  return { documents: documents.length, refreshed };
}

async function refreshGroup(group: DraftDocument[]): Promise<number> {
  const { organizationId, frameworkId } = group[0];
  const ordered = [...group].sort(
    (a, b) => REFRESHED_TYPES.indexOf(a.type) - REFRESHED_TYPES.indexOf(b.type),
  );
  let data = await collectPlatformData({ organizationId, frameworkId });
  let refreshed = 0;
  for (const document of ordered) {
    const previous = parsePlatformSnapshot(document.draftSnapshot);
    // Never generated: the first generation is a person's call (wizard / Generate).
    if (!previous) continue;
    if (!diffPlatformSnapshots({ type: document.type, previous, current: data }).isStale) {
      continue;
    }
    const current = data;
    const done = await db.$transaction(async (tx) => {
      await lockDocument(tx, document.id);
      // Re-check under the lock: it may have been sent for approval since the read.
      const fresh = await tx.ismsDocument.findFirst({
        where: { id: document.id, organizationId, status: { in: [...EDITABLE_STATUSES] } },
        select: { id: true },
      });
      if (!fresh) return false;
      await runDerivation({
        tx,
        type: document.type,
        documentId: document.id,
        organizationId,
        frameworkId,
        data: current,
      });
      await updateDraftSnapshot({ tx, documentId: document.id, snapshot: current });
      return true;
    });
    if (!done) continue;
    refreshed += 1;
    // Requirements fingerprint the parties register, which just changed.
    if (document.type === 'interested_parties_register') {
      data = await collectPlatformData({ organizationId, frameworkId });
    }
  }
  return refreshed;
}

export const refreshIsmsDraftsSchedule = schedules.task({
  id: 'refresh-isms-drafts-schedule',
  cron: '30 2 * * *', // 02:30 UTC daily
  maxDuration: 30 * 60,
  run: () => refreshIsmsDraftsForAllOrgs(),
});
