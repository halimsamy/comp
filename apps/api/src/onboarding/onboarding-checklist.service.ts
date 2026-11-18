import { BadRequestException, Injectable } from '@nestjs/common';
import { db, Prisma } from '@db';
import { buildChecklist } from './build-checklist';
import { CHECKLIST_ITEM_IDS } from './checklist-catalog';
import type { OnboardingChecklist } from './checklist-types';
import { loadChecklistState, parseSkips } from './load-checklist-state';

const isChecklistItemId = (id: string) =>
  (CHECKLIST_ITEM_IDS as readonly string[]).includes(id);

@Injectable()
export class OnboardingChecklistService {
  async getChecklist(organizationId: string): Promise<OnboardingChecklist> {
    return buildChecklist(await loadChecklistState(organizationId));
  }

  async skipItem({
    organizationId,
    itemId,
    reason,
    skippedById,
  }: {
    organizationId: string;
    itemId: string;
    reason: string;
    skippedById: string | null;
  }): Promise<OnboardingChecklist> {
    this.assertItemId(itemId);
    const skips = await this.readSkips(organizationId);
    skips[itemId] = {
      reason: reason.trim(),
      skippedAt: new Date().toISOString(),
      skippedById,
    };
    await this.writeSkips({ organizationId, skips });
    return this.getChecklist(organizationId);
  }

  async unskipItem({
    organizationId,
    itemId,
  }: {
    organizationId: string;
    itemId: string;
  }): Promise<OnboardingChecklist> {
    this.assertItemId(itemId);
    const skips = await this.readSkips(organizationId);
    delete skips[itemId];
    await this.writeSkips({ organizationId, skips });
    return this.getChecklist(organizationId);
  }

  private assertItemId(itemId: string) {
    if (!isChecklistItemId(itemId)) {
      throw new BadRequestException(`Unknown checklist item: ${itemId}`);
    }
  }

  private async readSkips(organizationId: string) {
    const row = await db.onboarding.findUnique({
      where: { organizationId },
      select: { checklistSkips: true },
    });
    return parseSkips(row?.checklistSkips);
  }

  private async writeSkips({
    organizationId,
    skips,
  }: {
    organizationId: string;
    skips: Prisma.InputJsonObject;
  }) {
    await db.onboarding.upsert({
      where: { organizationId },
      create: { organizationId, checklistSkips: skips },
      update: { checklistSkips: skips },
    });
  }
}
