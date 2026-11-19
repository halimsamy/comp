import { BadRequestException } from '@nestjs/common';
import { db } from '@db';
import { toDbEvidenceFormType } from '@trycompai/company';
import { evidenceFormDefinitions, type EvidenceFormType } from './evidence-forms.definitions';

const DIAGRAMMING_TASK_TEMPLATE = 'frk_tt_6849aad98c50d734dd904d98';

export async function assertActiveMember({
  organizationId,
  memberId,
}: {
  organizationId: string;
  memberId: string;
}) {
  const member = await db.member.findFirst({
    where: { id: memberId, organizationId, deactivated: false },
    select: { id: true },
  });
  if (!member) throw new BadRequestException('Owner must be an active member of this organization');
}

/** Bulk "Set owner" on the Documents table (#50). null clears the owner. */
export async function bulkSetFormOwner({
  organizationId,
  formTypes,
  ownerMemberId,
}: {
  organizationId: string;
  formTypes: EvidenceFormType[];
  ownerMemberId: string | null;
}) {
  if (ownerMemberId) await assertActiveMember({ organizationId, memberId: ownerMemberId });
  await db.$transaction(
    formTypes.map((formType) => {
      const dbType = toDbEvidenceFormType(formType);
      return db.evidenceFormSetting.upsert({
        where: { organizationId_formType: { organizationId, formType: dbType } },
        create: { organizationId, formType: dbType, ownerMemberId },
        update: { ownerMemberId },
      });
    }),
  );
  return { updatedCount: formTypes.length };
}

async function successorRecords({
  organizationId,
  path,
}: {
  organizationId: string;
  path: string;
}): Promise<{ path: string; recordCount: number }> {
  if (path === '/assets') {
    return { path, recordCount: await db.asset.count({ where: { organizationId, archivedAt: null } }) };
  }
  if (path.startsWith('/people')) {
    return { path, recordCount: await db.accessSystemRole.count({ where: { organizationId } }) };
  }
  if (path.startsWith('/documents/isms')) {
    const recordCount = await db.ismsManagementReview.count({ where: { document: { organizationId } } });
    return { path, recordCount };
  }
  const task = await db.task.findFirst({
    where: { organizationId, taskTemplateId: DIAGRAMMING_TASK_TEMPLATE, archivedAt: null },
    select: { id: true },
  });
  if (!task) return { path, recordCount: 0 };
  const recordCount = await db.attachment.count({
    where: { organizationId, entityType: 'task', entityId: task.id },
  });
  return { path: `/tasks/${task.id}`, recordCount };
}

/**
 * Where a retired form's evidence lives now (#130), with how many records the
 * module already holds, and for the penetration test form the latest pentest
 * recorded in Vulnerabilities > Scans.
 */
export async function getFormModuleStatus({
  organizationId,
  formType,
}: {
  organizationId: string;
  formType: EvidenceFormType;
}) {
  const retiredTo = evidenceFormDefinitions[formType].retiredTo;
  const successor = retiredTo
    ? { label: retiredTo.label, ...(await successorRecords({ organizationId, path: retiredTo.path })) }
    : null;
  const latestPentest =
    formType === 'penetration-test'
      ? await db.vulnerabilityScan.findFirst({
          where: { organizationId, kind: 'pentest' },
          orderBy: { scannedAt: 'desc' },
          select: { id: true, vendor: true, scannedAt: true, passed: true, findingCount: true },
        })
      : null;
  return { successor, latestPentest };
}
