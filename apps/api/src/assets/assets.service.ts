import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db, type Prisma } from '@db';
import { randomUUID } from 'node:crypto';
import { resolveActiveMember } from '../isms/utils/resolve-active-member';
import type { CreateAssetDto, UpdateAssetDto } from './dto/asset.dto';

const ASSET_SELECT = {
  id: true,
  name: true,
  type: true,
  source: true,
  providerSlug: true,
  externalId: true,
  resourceType: true,
  environment: true,
  cdeScope: true,
  dataClassification: true,
  ownerId: true,
  owner: {
    select: { id: true, user: { select: { name: true, email: true } } },
  },
  description: true,
  firstSeenAt: true,
  lastSeenAt: true,
  archivedAt: true,
  _count: { select: { vulnerabilities: { where: { status: 'open' } } } },
} satisfies Prisma.AssetSelect;

type AssetRow = Prisma.AssetGetPayload<{ select: typeof ASSET_SELECT }>;

function toResponse({ _count, owner, ...asset }: AssetRow) {
  return {
    ...asset,
    owner: owner
      ? { id: owner.id, name: owner.user.name, email: owner.user.email }
      : null,
    openVulnerabilities: _count.vulnerabilities,
  };
}

export type AssetResponse = ReturnType<typeof toResponse>;

@Injectable()
export class AssetsService {
  async list({
    organizationId,
    includeArchived,
  }: {
    organizationId: string;
    includeArchived: boolean;
  }): Promise<AssetResponse[]> {
    const rows = await db.asset.findMany({
      where: {
        organizationId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      select: ASSET_SELECT,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toResponse);
  }

  async create({
    organizationId,
    dto,
  }: {
    organizationId: string;
    dto: CreateAssetDto;
  }): Promise<AssetResponse> {
    const ownerId = await resolveActiveMember({
      memberId: dto.ownerId,
      organizationId,
    });
    const row = await db.asset.create({
      data: {
        organizationId,
        source: 'manual',
        externalId: randomUUID(),
        name: dto.name.trim(),
        type: dto.type,
        environment: dto.environment,
        cdeScope: dto.cdeScope,
        dataClassification: dto.dataClassification,
        ownerId: ownerId ?? null,
        description: dto.description?.trim() || null,
      },
      select: ASSET_SELECT,
    });
    return toResponse(row);
  }

  async update({
    organizationId,
    assetId,
    dto,
  }: {
    organizationId: string;
    assetId: string;
    dto: UpdateAssetDto;
  }): Promise<AssetResponse> {
    await this.findOrThrow({ organizationId, assetId });
    const ownerId = await resolveActiveMember({
      memberId: dto.ownerId,
      organizationId,
    });
    const row = await db.asset.update({
      where: { id: assetId, organizationId },
      data: {
        name: dto.name?.trim() || undefined,
        type: dto.type,
        environment: dto.environment,
        cdeScope: dto.cdeScope,
        dataClassification: dto.dataClassification,
        ownerId,
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
      },
      select: ASSET_SELECT,
    });
    return toResponse(row);
  }

  /** Only manual assets can be removed; synced ones leave when their source stops reporting them. */
  async remove({
    organizationId,
    assetId,
  }: {
    organizationId: string;
    assetId: string;
  }): Promise<{ id: string }> {
    const asset = await this.findOrThrow({ organizationId, assetId });
    if (asset.source !== 'manual') {
      throw new BadRequestException(
        'Synced assets leave the inventory when their source stops reporting them. Mark the asset out of scope instead.',
      );
    }
    await db.asset.delete({ where: { id: assetId, organizationId } });
    return { id: assetId };
  }

  private async findOrThrow({
    organizationId,
    assetId,
  }: {
    organizationId: string;
    assetId: string;
  }) {
    const asset = await db.asset.findFirst({
      where: { id: assetId, organizationId },
      select: { id: true, source: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }
}
