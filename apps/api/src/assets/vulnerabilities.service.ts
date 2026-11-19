import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import { randomUUID } from 'node:crypto';
import { AttachmentsService } from '../attachments/attachments.service';
import { resolveActiveMember } from '../isms/utils/resolve-active-member';
import { OwnershipNotifier } from '../notifications/ownership-notifier.service';
import type {
  CreateVulnerabilityDto,
  UpdateVulnerabilityDto,
} from './dto/vulnerability.dto';
import {
  loadVulnerabilityResponses,
  VULNERABILITY_SELECT,
  type VulnerabilityResponse,
} from './vulnerability-response';
import { loadSlaDays, slaDueDate } from './vulnerability-sla';
import { statusChangeError } from './vulnerability-status-rules';

interface Actor {
  userId?: string;
  memberId?: string;
}

@Injectable()
export class VulnerabilitiesService {
  constructor(
    private readonly attachments: AttachmentsService,
    private readonly ownership: OwnershipNotifier,
  ) {}

  async list(organizationId: string): Promise<VulnerabilityResponse[]> {
    const rows = await db.integrationPlatformFinding.findMany({
      where: { organizationId },
      select: VULNERABILITY_SELECT,
      orderBy: [
        { status: 'asc' },
        { slaDueAt: 'asc' },
        { firstSeenAt: 'desc' },
      ],
    });
    return loadVulnerabilityResponses({ organizationId, rows });
  }

  private async getOne(organizationId: string, id: string) {
    const row = await db.integrationPlatformFinding.findFirstOrThrow({
      where: { id, organizationId },
      select: VULNERABILITY_SELECT,
    });
    const [response] = await loadVulnerabilityResponses({
      organizationId,
      rows: [row],
    });
    return response;
  }

  async create({
    organizationId,
    dto,
    actor = {},
  }: {
    organizationId: string;
    dto: CreateVulnerabilityDto;
    actor?: Actor;
  }): Promise<VulnerabilityResponse> {
    const asset = dto.assetId
      ? await db.asset.findFirst({
          where: { id: dto.assetId, organizationId },
          select: { id: true, name: true, ownerId: true },
        })
      : null;
    if (dto.assetId && !asset) throw new NotFoundException('Asset not found');
    const firstSeenAt = dto.firstSeenAt
      ? new Date(`${dto.firstSeenAt}T00:00:00Z`)
      : new Date();
    const days = await loadSlaDays(organizationId);
    const row = await db.integrationPlatformFinding.create({
      data: {
        organizationId,
        source: 'manual',
        externalId: randomUUID(),
        title: dto.title.trim(),
        severity: dto.severity,
        description: dto.description?.trim() || null,
        cveId: dto.cveId?.toUpperCase() ?? null,
        resourceType: asset ? 'asset' : 'host',
        resourceId: asset?.name ?? (dto.resource?.trim() || 'Unspecified'),
        assetId: asset?.id ?? null,
        ownerId: asset?.ownerId ?? null,
        firstSeenAt,
        lastSeenAt: firstSeenAt,
        slaDueAt: slaDueDate({ severity: dto.severity, firstSeenAt, days }),
      },
      select: { id: true, title: true, ownerId: true },
    });
    if (row.ownerId) {
      await this.notifyOwner({ organizationId, row, actor });
    }
    return this.getOne(organizationId, row.id);
  }

  async update({
    organizationId,
    vulnerabilityId,
    dto,
    actor = {},
  }: {
    organizationId: string;
    vulnerabilityId: string;
    dto: UpdateVulnerabilityDto;
    actor?: Actor;
  }): Promise<VulnerabilityResponse> {
    const current = await db.integrationPlatformFinding.findFirst({
      where: { id: vulnerabilityId, organizationId },
      select: {
        id: true,
        title: true,
        source: true,
        status: true,
        severity: true,
        statusNote: true,
        ownerId: true,
        assetId: true,
        acceptedUntil: true,
        acceptedById: true,
      },
    });
    if (!current) throw new NotFoundException('Vulnerability not found');

    const asset =
      dto.assetId === undefined
        ? null
        : dto.assetId
          ? await db.asset.findFirst({
              where: { id: dto.assetId, organizationId },
              select: { id: true, name: true, ownerId: true },
            })
          : null;
    if (dto.assetId && !asset) throw new NotFoundException('Asset not found');
    const assetId = dto.assetId === undefined ? current.assetId : asset?.id;
    const assetScope = assetId
      ? ((
          await db.asset.findFirst({
            where: { id: assetId, organizationId },
            select: { cdeScope: true },
          })
        )?.cdeScope ?? null)
      : null;

    const note =
      dto.statusNote === undefined
        ? current.statusNote
        : dto.statusNote?.trim() || null;
    const status = dto.status ?? current.status;
    const acceptedById =
      status === 'risk_accepted'
        ? ((await resolveActiveMember({
            memberId: dto.acceptedById ?? current.acceptedById,
            organizationId,
          })) ?? null)
        : null;
    const acceptedUntil =
      status !== 'risk_accepted'
        ? null
        : dto.acceptedUntil
          ? new Date(`${dto.acceptedUntil}T23:59:59Z`)
          : current.acceptedUntil;
    const error = statusChangeError({
      status,
      note,
      source: current.source,
      severity: current.severity,
      assetScope,
      acceptedUntil,
      acceptedById,
      requesterMemberId:
        dto.acceptedById === undefined && status === current.status
          ? null // unchanged acceptance: re-saving a note must not re-check the approver
          : (actor.memberId ?? null),
      now: new Date(),
    });
    if (error) throw new BadRequestException(error);

    let ownerId = await resolveActiveMember({
      memberId: dto.ownerId,
      organizationId,
    });
    // Linking an asset to an unowned finding hands it to the asset owner.
    if (ownerId === undefined && !current.ownerId && asset?.ownerId) {
      ownerId = asset.ownerId;
    }
    const statusChange =
      status !== current.status
        ? { status, resolvedAt: status === 'resolved' ? new Date() : null }
        : {};

    await db.integrationPlatformFinding.update({
      where: { id: vulnerabilityId, organizationId },
      data: {
        ...statusChange,
        ownerId,
        assetId: dto.assetId === undefined ? undefined : (asset?.id ?? null),
        statusNote: dto.statusNote === undefined ? undefined : note,
        acceptedUntil,
        acceptedById,
      },
    });
    if (dto.evidence) {
      await this.attachments.uploadAttachment(
        organizationId,
        vulnerabilityId,
        'vulnerability',
        dto.evidence,
        actor.userId,
      );
    }
    if (ownerId && ownerId !== current.ownerId) {
      await this.notifyOwner({
        organizationId,
        row: { id: current.id, title: current.title, ownerId },
        actor,
      });
    }
    return this.getOne(organizationId, vulnerabilityId);
  }

  private notifyOwner({
    organizationId,
    row,
    actor,
  }: {
    organizationId: string;
    row: { id: string; title: string; ownerId: string | null };
    actor: Actor;
  }) {
    if (!row.ownerId) return Promise.resolve(false);
    return this.ownership.notify({
      organizationId,
      memberId: row.ownerId,
      entityType: 'vulnerability',
      entityName: row.title,
      url: `/vulnerabilities?id=${row.id}`,
      assignedByUserId: actor.userId ?? null,
    });
  }
}
