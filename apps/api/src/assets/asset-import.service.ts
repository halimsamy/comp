import { BadRequestException, Injectable } from '@nestjs/common';
import { db } from '@db';
import {
  rowsFromCsv,
  rowsFromInventoryForm,
  toAssetDraft,
  type InventoryRow,
} from './asset-inventory-import';

export interface AssetImportResult {
  created: number;
  updated: number;
  total: number;
}

const FORM_PREFIX = 'infra-form:';

/**
 * Brings a manual inventory into Assets, the single inventory (ISO 27001 A.5.9,
 * PCI DSS 12.5.1): the latest Infrastructure Inventory form submission or a
 * CSV. Rows upsert by a stable key, so re-importing never duplicates. A re-import
 * refreshes the descriptive fields and fills an empty owner or vendor; what
 * people set on the asset (name, type, scope, classification) is kept.
 */
@Injectable()
export class AssetImportService {
  private latestFormSubmission(organizationId: string) {
    return db.evidenceSubmission.findFirst({
      where: {
        organizationId,
        formType: 'infrastructure_inventory',
        status: { not: 'rejected' },
      },
      orderBy: { submittedAt: 'desc' },
      select: { id: true, submittedAt: true, data: true },
    });
  }

  /** What "Import from Infrastructure Inventory" would bring in, or null without a submission. */
  async formPreview(organizationId: string) {
    const submission = await this.latestFormSubmission(organizationId);
    if (!submission) return null;
    const rows = rowsFromInventoryForm(submission.data);
    if (rows.length === 0) return null;
    const imported = await db.asset.count({
      where: {
        organizationId,
        source: 'manual',
        externalId: { startsWith: FORM_PREFIX },
      },
    });
    return { rows: rows.length, submittedAt: submission.submittedAt, imported };
  }

  async importFromForm(organizationId: string): Promise<AssetImportResult> {
    const submission = await this.latestFormSubmission(organizationId);
    const rows = submission ? rowsFromInventoryForm(submission.data) : [];
    if (rows.length === 0) {
      throw new BadRequestException(
        'There is no Infrastructure Inventory submission with rows to import.',
      );
    }
    return this.upsertRows({ organizationId, rows });
  }

  async importCsv({
    organizationId,
    csv,
  }: {
    organizationId: string;
    csv: string;
  }): Promise<AssetImportResult> {
    let rows: InventoryRow[];
    try {
      rows = rowsFromCsv(csv);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid CSV',
      );
    }
    if (rows.length === 0) {
      throw new BadRequestException('The CSV has no asset rows.');
    }
    return this.upsertRows({ organizationId, rows });
  }

  private async upsertRows({
    organizationId,
    rows,
  }: {
    organizationId: string;
    rows: InventoryRow[];
  }): Promise<AssetImportResult> {
    const [members, vendors, existing] = await Promise.all([
      db.member.findMany({
        where: { organizationId, deactivated: false },
        select: { id: true, user: { select: { name: true, email: true } } },
      }),
      db.vendor.findMany({
        where: { organizationId },
        select: { id: true, name: true },
      }),
      db.asset.findMany({
        where: {
          organizationId,
          source: 'manual',
          externalId: { in: rows.map((r) => r.key) },
        },
        select: { id: true, externalId: true, ownerId: true, vendorId: true },
      }),
    ]);
    const memberRefs = members.map((m) => ({
      id: m.id,
      name: m.user.name,
      email: m.user.email,
    }));
    const byKey = new Map(existing.map((a) => [a.externalId, a]));

    // The last row wins when a CSV repeats a name.
    const drafts = [
      ...new Map(
        rows.map((row) => [
          row.key,
          toAssetDraft({ row, members: memberRefs, vendors }),
        ]),
      ).values(),
    ];
    const result: AssetImportResult = {
      created: 0,
      updated: 0,
      total: drafts.length,
    };
    await db.$transaction(
      async (tx) => {
        for (const draft of drafts) {
          const current = byKey.get(draft.externalId);
          if (!current) {
            await tx.asset.create({
              data: { organizationId, source: 'manual', ...draft },
            });
            result.created++;
            continue;
          }
          await tx.asset.update({
            where: { id: current.id, organizationId },
            data: {
              description: draft.description,
              location: draft.location,
              version: draft.version ?? undefined,
              endOfSupportAt: draft.endOfSupportAt ?? undefined,
              lastReviewedAt: draft.lastReviewedAt ?? undefined,
              ownerId: current.ownerId ?? draft.ownerId,
              vendorId: current.vendorId ?? draft.vendorId,
              archivedAt: null,
            },
          });
          result.updated++;
        }
      },
      { timeout: 60_000 },
    );
    return result;
  }
}
