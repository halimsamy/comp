import { BadRequestException } from '@nestjs/common';
import type { IsmsDocumentType, Prisma } from '@db';
import {
  generateContextIssues,
  generateInterestedParties,
  generateObjectives,
  generateRequirements,
} from './generate-registers';
import { seedRolesIfMissing } from './roles';
import { assignSuggestedHolders, seedPciRoleIfMissing } from './role-automation';
import { seedMetricsIfMissing } from './monitoring';
import { deriveNarrativeForType, isNarrativeType } from './registry';
import type { IsmsPlatformData } from './types';

type Tx = Prisma.TransactionClient;

/** True when a stored narrative actually holds content (not null/undefined or {}). */
function hasNarrativeContent(narrative: unknown): boolean {
  return (
    narrative != null &&
    typeof narrative === 'object' &&
    !Array.isArray(narrative) &&
    Object.keys(narrative).length > 0
  );
}

async function generateNarrative({
  tx,
  documentId,
  type,
  data,
}: {
  tx: Tx;
  documentId: string;
  type: IsmsDocumentType;
  data: IsmsPlatformData;
}): Promise<void> {
  const derived = deriveNarrativeForType({ type, data });
  if (!derived) return;
  const narrative: Prisma.InputJsonValue = JSON.parse(JSON.stringify(derived));

  // The draft narrative lives on IsmsDocument (CS-701). Preserve a non-empty
  // existing draft so a regenerate never clobbers the customer's manual edits
  // (CS-437 override); seed an absent/empty draft with the derived narrative.
  const document = await tx.ismsDocument.findUnique({
    where: { id: documentId },
    select: { draftNarrative: true },
  });
  if (document && hasNarrativeContent(document.draftNarrative)) return;
  await tx.ismsDocument.update({
    where: { id: documentId },
    data: { draftNarrative: narrative },
  });
}

/** Run the type-specific derivation inside an open transaction. */
export async function runDerivation({
  tx,
  type,
  documentId,
  organizationId,
  frameworkId,
  data,
}: {
  tx: Tx;
  type: IsmsDocumentType;
  documentId: string;
  organizationId: string;
  frameworkId: string;
  data: IsmsPlatformData;
}): Promise<void> {
  if (type === 'context_of_organization') {
    await generateContextIssues({ tx, documentId, data });
    return;
  }
  if (type === 'interested_parties_register') {
    await generateInterestedParties({ tx, documentId, data });
    return;
  }
  if (type === 'interested_parties_requirements') {
    await generateRequirements({
      tx,
      documentId,
      organizationId,
      frameworkId,
      data,
    });
    return;
  }
  if (type === 'objectives_plan') {
    await generateObjectives({ tx, documentId, data });
    return;
  }
  if (type === 'roles_and_responsibilities') {
    // Idempotent seed only — never a destructive replace, so member assignments
    // (IsmsRoleAssignment) and customer edits survive every regenerate.
    await seedRolesIfMissing({ tx, documentId, memberCount: data.memberCount });
    await seedPciRoleIfMissing({
      tx,
      documentId,
      frameworkNames: data.frameworkNames,
    });
    // Fills only roles with no holder yet, so existing choices are kept.
    await assignSuggestedHolders({ tx, documentId, organizationId });
    return;
  }
  if (type === 'monitoring') {
    // Idempotent seed only (same guarantee as roles): a regenerate can never
    // clobber metric edits, deactivations, or measurement history.
    await seedMetricsIfMissing({ tx, documentId });
    return;
  }
  if (type === 'internal_audit') {
    // Only the Programme paragraph is derivable; audit instances are
    // customer-created (their Controls Tested rows seed at audit creation).
    // Seed-if-empty, so a regenerate never clobbers an edited programme.
    await generateNarrative({ tx, documentId, type, data });
    return;
  }
  if (type === 'management_review') {
    // Only the Procedure paragraph is derivable; review instances are
    // customer-created (their Inputs rows seed at review creation).
    // Seed-if-empty, so a regenerate never clobbers an edited procedure.
    await generateNarrative({ tx, documentId, type, data });
    return;
  }
  if (type === 'risk_treatment_plan') {
    // Nothing is stored on generate: the plan renders live from the Risk
    // Register + Vendors at export/snapshot time (loadRiskTreatmentExtras).
    return;
  }
  if (isNarrativeType(type)) {
    await generateNarrative({ tx, documentId, type, data });
    return;
  }
  throw new BadRequestException(`Generation not implemented for type ${type}`);
}
