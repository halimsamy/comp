import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db, type AssetCdeScope, type Prisma } from '@db';
import { randomUUID } from 'node:crypto';
import { resolveActiveMember } from '../isms/utils/resolve-active-member';
import { OwnershipNotifier } from '../notifications/ownership-notifier.service';
import { logScopeChange } from './asset-review';
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
  scopeJustification: true,
  dataClassification: true,
  ownerId: true,
  owner: {
    select: { id: true, user: { select: { name: true, email: true } } },
  },
  description: true,
  location: true,
  vendorId: true,
  vendor: { select: { id: true, name: true } },
  version: true,
  endOfSupportAt: true,
  lastReviewedAt: true,
  lastScannedAt: true,
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

interface Actor {
  userId?: string;
  memberId?: string;
}

const dayOrNull = (value: string | null | undefined) =>
  value === undefined
    ? undefined
    : value
      ? new Date(`${value}T00:00:00Z`)
      : null;
const textOrNull = (value: string | null | undefined) =>
  value === undefined ? undefined : value?.trim() || null;

@Injectable()
export class AssetsService {
  constructor(private readonly ownership: OwnershipNotifier) {}

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
    actor = {},
  }: {
    organizationId: string;
    dto: CreateAssetDto;
    actor?: Actor;
  }): Promise<AssetResponse> {
    const scopeJustification = textOrNull(dto.scopeJustification) ?? null;
    assertJustified({ cdeScope: dto.cdeScope, scopeJustification });
    const [ownerId, vendorId] = await Promise.all([
      resolveActiveMember({ memberId: dto.ownerId, organizationId }),
      resolveVendor({ vendorId: dto.vendorId, organizationId }),
    ]);
    const row = await db.asset.create({
      data: {
        organizationId,
        source: 'manual',
        externalId: randomUUID(),
        name: dto.name.trim(),
        type: dto.type,
        environment: dto.environment,
        cdeScope: dto.cdeScope,
        scopeJustification,
        dataClassification: dto.dataClassification,
        ownerId: ownerId ?? null,
        vendorId: vendorId ?? null,
        description: textOrNull(dto.description) ?? null,
        location: textOrNull(dto.location) ?? null,
        version: textOrNull(dto.version) ?? null,
        endOfSupportAt: dayOrNull(dto.endOfSupportAt) ?? null,
      },
      select: ASSET_SELECT,
    });
    if (row.ownerId) await this.notifyOwner({ organizationId, row, actor });
    return toResponse(row);
  }

  async update({
    organizationId,
    assetId,
    dto,
    actor = {},
  }: {
    organizationId: string;
    assetId: string;
    dto: UpdateAssetDto;
    actor?: Actor;
  }): Promise<AssetResponse> {
    const current = await this.findOrThrow({ organizationId, assetId });
    const cdeScope = dto.cdeScope ?? current.cdeScope;
    const justification = textOrNull(dto.scopeJustification);
    const scopeJustification =
      cdeScope !== 'out_of_scope'
        ? null
        : justification === undefined
          ? current.scopeJustification
          : justification;
    assertJustified({ cdeScope, scopeJustification });
    const [ownerId, vendorId] = await Promise.all([
      resolveActiveMember({ memberId: dto.ownerId, organizationId }),
      resolveVendor({ vendorId: dto.vendorId, organizationId }),
    ]);
    const row = await db.asset.update({
      where: { id: assetId, organizationId },
      data: {
        name: dto.name?.trim() || undefined,
        type: dto.type,
        environment: dto.environment,
        cdeScope: dto.cdeScope,
        scopeJustification,
        dataClassification: dto.dataClassification,
        ownerId,
        vendorId,
        description: textOrNull(dto.description),
        location: textOrNull(dto.location),
        version: textOrNull(dto.version),
        endOfSupportAt: dayOrNull(dto.endOfSupportAt),
      },
      select: ASSET_SELECT,
    });
    if (cdeScope !== current.cdeScope) {
      await logScopeChange({
        organizationId,
        actor,
        asset: { id: row.id, name: row.name },
        from: current.cdeScope,
        to: cdeScope,
        justification: scopeJustification,
      });
    }
    if (row.ownerId && row.ownerId !== current.ownerId) {
      await this.notifyOwner({ organizationId, row, actor });
    }
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

  private notifyOwner({
    organizationId,
    row,
    actor,
  }: {
    organizationId: string;
    row: { id: string; name: string; ownerId: string | null };
    actor: Actor;
  }) {
    if (!row.ownerId) return Promise.resolve(false);
    return this.ownership.notify({
      organizationId,
      memberId: row.ownerId,
      entityType: 'asset',
      entityName: row.name,
      url: `/assets?id=${row.id}`,
      assignedByUserId: actor.userId ?? null,
    });
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
      select: {
        id: true,
        source: true,
        cdeScope: true,
        scopeJustification: true,
        ownerId: true,
      },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }
}

/** PCI DSS 12.5.2: excluding a system from scope must be justified. */
function assertJustified({
  cdeScope,
  scopeJustification,
}: {
  cdeScope: AssetCdeScope | undefined;
  scopeJustification: string | null | undefined;
}) {
  if (cdeScope === 'out_of_scope' && !scopeJustification) {
    throw new BadRequestException(
      'Explain why the asset is out of PCI DSS scope (for example, no network path to the CDE).',
    );
  }
}

/** Three-state vendor reference: undefined = leave, null/blank = clear, else a vendor of the org. */
async function resolveVendor({
  vendorId,
  organizationId,
}: {
  vendorId: string | null | undefined;
  organizationId: string;
}): Promise<string | null | undefined> {
  if (vendorId === undefined) return undefined;
  if (!vendorId?.trim()) return null;
  const vendor = await db.vendor.findFirst({
    where: { id: vendorId, organizationId },
    select: { id: true },
  });
  if (!vendor) throw new NotFoundException('Vendor not found');
  return vendor.id;
}
