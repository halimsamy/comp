import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { TrainingCertificatePdfService } from './training-certificate-pdf.service';
import { computeTrainingCycles, type TrainingCycle } from './training-cycles';

@Injectable()
export class TrainingHistoryService {
  constructor(
    private readonly certificatePdfService: TrainingCertificatePdfService,
  ) {}

  /** Every completed training cycle for a member, newest first: past (archived) and current. */
  async getCycles({
    organizationId,
    memberId,
  }: {
    organizationId: string;
    memberId: string;
  }): Promise<TrainingCycle[]> {
    const member = await db.member.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    const [records, current, modules] = await Promise.all([
      db.trainingCompletionRecord.findMany({
        where: { organizationId, memberId },
        select: { moduleId: true, completedAt: true, expiresAt: true },
      }),
      db.employeeTrainingVideoCompletion.findMany({
        where: { memberId, completedAt: { not: null } },
        select: { videoId: true, completedAt: true },
      }),
      db.trainingModule.findMany({
        where: { organizationId },
        select: { id: true, title: true },
      }),
    ]);

    const entries = [
      ...records,
      ...current.flatMap((c) =>
        c.completedAt ? [{ moduleId: c.videoId, completedAt: c.completedAt }] : [],
      ),
    ];

    return computeTrainingCycles({
      entries,
      moduleTitles: Object.fromEntries(modules.map((m) => [m.id, m.title])),
    });
  }

  async generateCycleCertificate({
    organizationId,
    memberId,
    moduleId,
    completedAt,
  }: {
    organizationId: string;
    memberId: string;
    moduleId: string;
    completedAt: Date;
  }): Promise<{ pdf: Buffer; fileName: string }> {
    const cycles = await this.getCycles({ organizationId, memberId });
    const cycle = cycles.find(
      (c) =>
        c.moduleId === moduleId &&
        c.completedAt.getTime() === completedAt.getTime(),
    );
    if (!cycle) throw new BadRequestException('No completed training cycle matches');

    const member = await db.member.findFirst({
      where: { id: memberId, organizationId },
      select: {
        user: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });
    const userName = member?.user.name || 'Team Member';

    const pdf = await this.certificatePdfService.generateCustomCertificatePdf({
      userName,
      organizationName: member?.organization.name || 'Organization',
      completedAt: cycle.completedAt,
      title: cycle.title,
    });
    const slug = (value: string) => value.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    const date = cycle.completedAt.toISOString().slice(0, 10);

    return {
      pdf,
      fileName: `${slug(cycle.title)}-${slug(userName)}-${date}.pdf`,
    };
  }
}
