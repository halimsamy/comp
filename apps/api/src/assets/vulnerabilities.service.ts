import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db, type Prisma } from '@db';
import { randomUUID } from 'node:crypto';
import { resolveActiveMember } from '../isms/utils/resolve-active-member';
import type {
  CreateVulnerabilityDto,
  UpdateVulnerabilityDto,
} from './dto/vulnerability.dto';
import { slaDueDate, slaStatus } from './vulnerability-sla';

export const VULNERABILITY_SELECT = {
  id: true,
  title: true,
  description: true,
  remediation: true,
  severity: true,
  status: true,
  statusNote: true,
  source: true,
  cveId: true,
  resourceType: true,
  resourceId: true,
  firstSeenAt: true,
  lastSeenAt: true,
  resolvedAt: true,
  slaDueAt: true,
  connection: { select: { provider: { select: { slug: true, name: true } } } },
  asset: {
    select: {
      id: true,
      name: true,
      type: true,
      cdeScope: true,
      environment: true,
    },
  },
  owner: {
    select: { id: true, user: { select: { name: true, email: true } } },
  },
} satisfies Prisma.IntegrationPlatformFindingSelect;

type VulnerabilityRow = Prisma.IntegrationPlatformFindingGetPayload<{
  select: typeof VULNERABILITY_SELECT;
}>;

export function toVulnerabilityResponse(
  { connection, owner, ...row }: VulnerabilityRow,
  now = new Date(),
) {
  return {
    ...row,
    provider: connection?.provider ?? null,
    owner: owner
      ? { id: owner.id, name: owner.user.name, email: owner.user.email }
      : null,
    slaStatus: slaStatus({ status: row.status, slaDueAt: row.slaDueAt, now }),
  };
}

export type VulnerabilityResponse = ReturnType<typeof toVulnerabilityResponse>;

@Injectable()
export class VulnerabilitiesService {
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
    const now = new Date();
    return rows.map((row) => toVulnerabilityResponse(row, now));
  }

  async create({
    organizationId,
    dto,
  }: {
    organizationId: string;
    dto: CreateVulnerabilityDto;
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
        slaDueAt: slaDueDate({ severity: dto.severity, firstSeenAt }),
      },
      select: VULNERABILITY_SELECT,
    });
    return toVulnerabilityResponse(row);
  }

  async update({
    organizationId,
    vulnerabilityId,
    dto,
  }: {
    organizationId: string;
    vulnerabilityId: string;
    dto: UpdateVulnerabilityDto;
  }): Promise<VulnerabilityResponse> {
    const current = await db.integrationPlatformFinding.findFirst({
      where: { id: vulnerabilityId, organizationId },
      select: { id: true, source: true, status: true, statusNote: true },
    });
    if (!current) throw new NotFoundException('Vulnerability not found');

    const note =
      dto.statusNote === undefined
        ? current.statusNote
        : dto.statusNote?.trim() || null;
    if (dto.status === 'ignored' && !note) {
      throw new BadRequestException(
        'Explain why the finding is ignored (accepted risk or false positive).',
      );
    }
    if (dto.status === 'resolved' && current.source === 'integration') {
      throw new BadRequestException(
        'Integration findings resolve automatically once the scanner stops reporting them. Fix the issue and run a new scan.',
      );
    }
    const ownerId = await resolveActiveMember({
      memberId: dto.ownerId,
      organizationId,
    });
    const statusChange =
      dto.status && dto.status !== current.status
        ? {
            status: dto.status,
            resolvedAt: dto.status === 'resolved' ? new Date() : null,
          }
        : {};

    const row = await db.integrationPlatformFinding.update({
      where: { id: vulnerabilityId, organizationId },
      data: {
        ...statusChange,
        ownerId,
        statusNote: dto.statusNote === undefined ? undefined : note,
      },
      select: VULNERABILITY_SELECT,
    });
    return toVulnerabilityResponse(row);
  }
}
