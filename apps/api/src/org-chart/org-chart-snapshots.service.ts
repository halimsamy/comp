import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db, type Prisma } from '@db';

@Injectable()
export class OrgChartSnapshotsService {
  async list(organizationId: string) {
    const snapshots = await db.organizationChartSnapshot.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true, createdById: true, nodes: true },
    });
    return snapshots.map(({ nodes, ...rest }) => ({
      ...rest,
      nodeCount: Array.isArray(nodes) ? nodes.length : 0,
    }));
  }

  async get({ organizationId, snapshotId }: { organizationId: string; snapshotId: string }) {
    const snapshot = await db.organizationChartSnapshot.findFirst({
      where: { id: snapshotId, organizationId },
    });
    if (!snapshot) throw new NotFoundException('Snapshot not found');
    return snapshot;
  }

  /** Freezes the current interactive chart as dated evidence of roles and reporting lines. */
  async create({
    organizationId,
    name,
    createdById,
  }: {
    organizationId: string;
    name?: string;
    createdById?: string;
  }) {
    const chart = await db.organizationChart.findUnique({ where: { organizationId } });
    const nodes = Array.isArray(chart?.nodes) ? chart.nodes : [];
    if (!chart || chart.type !== 'interactive' || nodes.length === 0) {
      throw new BadRequestException('Build an interactive org chart before saving a snapshot');
    }
    const date = new Date().toISOString().slice(0, 10);
    return db.organizationChartSnapshot.create({
      data: {
        organizationId,
        name: name?.trim() || `Org chart ${date}`,
        nodes: chart.nodes as Prisma.InputJsonValue,
        edges: chart.edges as Prisma.InputJsonValue,
        createdById,
      },
    });
  }
}
