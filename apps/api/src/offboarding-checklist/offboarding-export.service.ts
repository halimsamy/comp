import { Injectable } from '@nestjs/common';
import { db } from '@db';
import archiver from 'archiver';
import { AttachmentsService } from '../attachments/attachments.service';
import { AccessRevocationService } from './access-revocation.service';
import { OffboardingChecklistService } from './offboarding-checklist.service';

type ChecklistItems = Awaited<
  ReturnType<OffboardingChecklistService['getMemberChecklist']>
>['items'];

type Revocations = Awaited<
  ReturnType<AccessRevocationService['getAccessRevocations']>
>;
type VendorList = Revocations['systems'];

/** Inventory systems, plus vendor rows someone actually confirmed. */
const revocationRows = (r: Revocations): VendorList => [
  ...r.systems,
  ...r.vendors.filter((v) => v.revoked),
];

@Injectable()
export class OffboardingExportService {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly accessRevocationService: AccessRevocationService,
    private readonly offboardingChecklistService: OffboardingChecklistService,
  ) {}

  async exportMemberEvidence({
    organizationId,
    memberId,
    output,
  }: {
    organizationId: string;
    memberId: string;
    output: NodeJS.WritableStream;
  }) {
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      archive.abort();
      if ('destroy' in output && typeof (output as { destroy?: unknown }).destroy === 'function') {
        (output as { destroy: (err: Error) => void }).destroy(err);
      }
    });
    archive.pipe(output);

    const checklist =
      await this.offboardingChecklistService.getMemberChecklist(
        organizationId,
        memberId,
      );
    const revocations =
      await this.accessRevocationService.getAccessRevocations(
        organizationId,
        memberId,
      );

    this.appendSummaryCsv(archive, checklist.items);
    this.appendVendorRevocationsCsv(archive, revocationRows(revocations));
    await this.appendVendorEvidence(
      archive,
      organizationId,
      revocationRows(revocations),
    );
    await this.appendChecklistEvidence(
      archive,
      organizationId,
      checklist.items,
    );

    await archive.finalize();
  }

  private appendSummaryCsv(
    archive: archiver.Archiver,
    items: ChecklistItems,
    prefix = '',
  ) {
    const rows = [
      'Item,Status,Completed By,Completed Date,Evidence Count',
      ...items.map((item) => {
        const status = item.completed ? 'Complete' : 'Pending';
        const completedBy = item.completion?.completedBy?.name ?? '';
        const completedDate = item.completion?.completedAt
          ? new Date(item.completion.completedAt).toISOString().split('T')[0]
          : '';
        return `"${escapeCsvField(item.title)}",${status},"${escapeCsvField(completedBy)}",${completedDate},${item.evidence.length}`;
      }),
    ];
    archive.append(rows.join('\n'), { name: `${prefix}summary.csv` });
  }

  private appendVendorRevocationsCsv(
    archive: archiver.Archiver,
    vendors: VendorList,
    prefix = '',
  ) {
    const rows = [
      'System,Source,Accounts,Status,Confirmed By,Date,Notes,Has Evidence',
      ...vendors.map((v) => {
        const confirmedBy = v.revokedBy?.name ?? (v.revoked ? 'Access inventory' : '');
        const date = v.revokedAt
          ? new Date(v.revokedAt).toISOString().split('T')[0]
          : '';
        const status = v.stillActive ? 'Revoked but still active' : v.revoked ? 'Revoked' : 'Pending';
        const accounts = v.accounts.map((a) => `${a.name} (${a.status})`).join('; ');
        const hasEvidence = (v.evidence?.length ?? 0) > 0 ? 'Yes' : 'No';
        return [v.name, v.kind === 'vendor' ? 'Vendor' : 'Access inventory', accounts, status, confirmedBy]
          .map((f) => `"${escapeCsvField(f)}"`)
          .concat(date, `"${escapeCsvField(v.notes ?? '')}"`, hasEvidence)
          .join(',');
      }),
    ];
    archive.append(rows.join('\n'), {
      name: `${prefix}access-revocations/access-revocations.csv`,
    });
  }

  private async appendVendorEvidence(
    archive: archiver.Archiver,
    organizationId: string,
    vendors: VendorList,
    prefix = '',
  ) {
    for (const vendor of vendors) {
      if (!vendor.evidence || vendor.evidence.length === 0) continue;
      for (const file of vendor.evidence) {
        const buffer = await this.getAttachmentBuffer(organizationId, file.id);
        if (!buffer) continue;
        const safeName = sanitizeFileName(file.name);
        archive.append(buffer, {
          name: `${prefix}access-revocations/evidence/${file.id}-${safeName}`,
        });
      }
    }
  }

  private async appendChecklistEvidence(
    archive: archiver.Archiver,
    organizationId: string,
    items: ChecklistItems,
    prefix = '',
  ) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.evidence.length === 0) continue;
      const folderNum = String(i + 1).padStart(2, '0');
      const folderName = item.title
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
      for (const file of item.evidence) {
        const buffer = await this.getAttachmentBuffer(organizationId, file.id);
        if (!buffer) continue;
        const safeName = sanitizeFileName(file.name);
        archive.append(buffer, {
          name: `${prefix}checklist-items/${folderNum}-${folderName}/${file.id}-${safeName}`,
        });
      }
    }
  }

  async exportAllOffboardings({
    organizationId,
    output,
  }: {
    organizationId: string;
    output: NodeJS.WritableStream;
  }) {
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      archive.abort();
      if ('destroy' in output && typeof (output as { destroy?: unknown }).destroy === 'function') {
        (output as { destroy: (err: Error) => void }).destroy(err);
      }
    });
    archive.pipe(output);

    await this.appendAllOffboardings({ archive, organizationId });
    await archive.finalize();
  }

  /**
   * Append every offboarded member's checklist summary, vendor access
   * revocations and evidence files under `prefix` in an archive the caller owns
   * (also used by the framework evidence export).
   */
  async appendAllOffboardings({
    archive,
    organizationId,
    prefix = '',
  }: {
    archive: archiver.Archiver;
    organizationId: string;
    prefix?: string;
  }) {
    const BATCH_SIZE = 50;
    let cursor: string | undefined;
    const register = [
      'Name,Email,Offboard date,Account,Checklist completed,Systems revoked,Revoked but still active',
    ];

    while (true) {
      const batch = await db.member.findMany({
        // #85: everyone with an offboard date, the same population as the register.
        where: { organizationId, offboardDate: { not: null } },
        include: { user: { select: { name: true, email: true } } },
        orderBy: [{ offboardDate: 'desc' }, { id: 'asc' }],
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      for (const member of batch) {
        const safeName = (member.user.name ?? 'member')
          .replace(/[^a-zA-Z0-9 ]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase();
        const memberPrefix = `${prefix}offboarded-employees/${safeName}-${member.id}/`;

        const checklist = await this.offboardingChecklistService.getMemberChecklist(
          organizationId,
          member.id,
        );
        const revocations = await this.accessRevocationService.getAccessRevocations(
          organizationId,
          member.id,
        );

        this.appendSummaryCsv(archive, checklist.items, memberPrefix);
        this.appendVendorRevocationsCsv(archive, revocationRows(revocations), memberPrefix);
        await this.appendVendorEvidence(archive, organizationId, revocationRows(revocations), memberPrefix);
        register.push(
          [
            member.user.name ?? '',
            member.user.email,
            member.offboardDate ? member.offboardDate.toISOString().slice(0, 10) : '',
            member.deactivated ? 'Deactivated' : 'Active',
            `${checklist.completedItems}/${checklist.totalItems}`,
            `${revocations.revokedCount}/${revocations.totalSystems}`,
            String(revocations.stillActiveCount),
          ]
            .map((f) => `"${escapeCsvField(f)}"`)
            .join(','),
        );
        await this.appendChecklistEvidence(archive, organizationId, checklist.items, memberPrefix);
      }

      if (batch.length < BATCH_SIZE) break;
      cursor = batch[batch.length - 1]!.id;
    }
    archive.append(register.join('\n'), { name: `${prefix}offboarding-register.csv` });
  }

  private async getAttachmentBuffer(
    organizationId: string,
    attachmentId: string,
  ): Promise<Buffer | null> {
    try {
      const attachment = await db.attachment.findFirst({
        where: { id: attachmentId, organizationId },
      });
      if (!attachment) return null;
      return await this.attachmentsService.getObjectBuffer(attachment.url);
    } catch {
      return null;
    }
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/.*[/\\]/, '').replace(/[/\\]/g, '_') || 'file';
}

function escapeCsvField(value: string): string {
  const escaped = value.replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(escaped)) {
    return `'${escaped}`;
  }
  return escaped;
}
