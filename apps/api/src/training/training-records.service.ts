import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { GENERAL_TRAINING_VIDEO_IDS, HIPAA_TRAINING_ID } from '@trycompai/company';
import { AttachmentsService } from '../attachments/attachments.service';
import { isModuleAssigned } from '../people-lifecycle/native-state-modules';
import type { ImportTrainingRowDto, RecordTrainingDto } from './dto/training-records.dto';
import { addMonths, TRAINING_VALIDITY_MONTHS } from './training-cycles';

export const GENERAL_MODULE = 'general';
export const HIPAA_MODULE = 'hipaa';

/** "Security awareness", "SAT", "general" → general; "HIPAA" → hipaa; else a module id or title. */
export function resolveModuleKey({
  value,
  modules,
}: {
  value: string;
  modules: { id: string; title: string }[];
}): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === GENERAL_MODULE || v === 'sat' || v.includes('security awareness')) return GENERAL_MODULE;
  if (v === HIPAA_MODULE || v === HIPAA_TRAINING_ID || v.includes('hipaa')) return HIPAA_MODULE;
  return modules.find((m) => m.id.toLowerCase() === v || m.title.trim().toLowerCase() === v)?.id ?? null;
}

/**
 * Training recorded outside the portal (#94, #179): instructor-led sessions,
 * an LMS export, or an HR spreadsheet. Built-in training updates the current
 * completion state too, so every people score sees the member as trained.
 */
@Injectable()
export class TrainingRecordsService {
  constructor(private readonly attachments: AttachmentsService) {}

  async record({
    organizationId,
    memberId,
    userId,
    dto,
    source = 'admin',
  }: {
    organizationId: string;
    memberId: string;
    userId?: string;
    dto: RecordTrainingDto;
    source?: 'admin' | 'import';
  }) {
    const completedAt = new Date(dto.completedAt);
    if (completedAt.getTime() > Date.now()) {
      throw new BadRequestException('The completion date cannot be in the future');
    }
    const member = await db.member.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true, role: true, department: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    const modules = await db.trainingModule.findMany({ where: { organizationId, isEnabled: true } });
    const key = resolveModuleKey({ value: dto.module, modules });
    if (!key) throw new BadRequestException(`Unknown training "${dto.module}"`);
    const custom = modules.find((m) => m.id === key);
    if (custom && !isModuleAssigned({ module: custom, member })) {
      throw new BadRequestException('This training module is not assigned to the member');
    }

    const attachment =
      dto.fileName && dto.fileType && dto.fileData
        ? await this.attachments.uploadAttachment(
            organizationId,
            memberId,
            'training_record',
            { fileName: dto.fileName, fileType: dto.fileType, fileData: dto.fileData, description: 'Training record' },
            userId,
          )
        : null;
    const moduleIds = key === GENERAL_MODULE ? [...GENERAL_TRAINING_VIDEO_IDS] : key === HIPAA_MODULE ? [HIPAA_TRAINING_ID] : [key];
    const months = custom?.recurrenceMonths ?? TRAINING_VALIDITY_MONTHS;
    const builtIn = !custom;
    const existing = builtIn
      ? await db.employeeTrainingVideoCompletion.findMany({
          where: { memberId, videoId: { in: moduleIds } },
          select: { videoId: true, completedAt: true },
        })
      : [];
    // Never move the current completion back to an older date.
    const newer = moduleIds.filter((videoId) => {
      const current = existing.find((e) => e.videoId === videoId)?.completedAt;
      return !current || current < completedAt;
    });

    await db.$transaction([
      db.trainingCompletionRecord.createMany({
        data: moduleIds.map((moduleId) => ({
          organizationId,
          memberId,
          moduleId,
          completedAt,
          expiresAt: addMonths({ date: completedAt, months }),
          attachmentId: attachment?.id ?? null,
          source,
        })),
      }),
      // Built-in training also lives in the current-state table the portal and scores read.
      ...(builtIn
        ? newer.map((videoId) =>
            db.employeeTrainingVideoCompletion.upsert({
              where: { memberId_videoId: { memberId, videoId } },
              create: { memberId, videoId, completedAt },
              update: { completedAt },
            }),
          )
        : []),
    ]);
    return { recorded: moduleIds.length, module: key, completedAt };
  }

  /** CSV rows (email, module, completedAt); each row is applied independently. */
  async import({
    organizationId,
    userId,
    rows,
  }: {
    organizationId: string;
    userId?: string;
    rows: ImportTrainingRowDto[];
  }) {
    const members = await db.member.findMany({
      where: { organizationId },
      select: { id: true, user: { select: { email: true } } },
    });
    const byEmail = new Map(members.map((m) => [m.user.email.toLowerCase(), m.id]));
    let imported = 0;
    const errors: { row: number; message: string }[] = [];
    for (const [index, row] of rows.entries()) {
      const memberId = byEmail.get(row.email.trim().toLowerCase());
      if (!memberId) {
        errors.push({ row: index + 1, message: `No member with email ${row.email}` });
        continue;
      }
      try {
        await this.record({
          organizationId,
          memberId,
          userId,
          dto: { module: row.module, completedAt: row.completedAt },
          source: 'import',
        });
        imported++;
      } catch (error) {
        errors.push({ row: index + 1, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return { imported, errors };
  }
}

/** Every training completion of the organization, for the CSV export and the auditor register. */
export async function listTrainingRecords(organizationId: string) {
  const [records, modules, members] = await Promise.all([
    db.trainingCompletionRecord.findMany({
      where: { organizationId },
      orderBy: { completedAt: 'desc' },
    }),
    db.trainingModule.findMany({ where: { organizationId }, select: { id: true, title: true } }),
    db.member.findMany({
      where: { organizationId },
      select: { id: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  const current = await db.employeeTrainingVideoCompletion.findMany({
    where: { memberId: { in: members.map((m) => m.id) }, completedAt: { not: null } },
    select: { memberId: true, videoId: true, completedAt: true },
  });
  const title = (moduleId: string) =>
    modules.find((m) => m.id === moduleId)?.title ??
    (moduleId === HIPAA_TRAINING_ID ? 'HIPAA training' : `Security awareness training (${moduleId})`);
  const member = (id: string) => members.find((m) => m.id === id)?.user;
  const seen = new Set(records.map((r) => `${r.memberId}|${r.moduleId}|${r.completedAt.getTime()}`));
  const rows = [
    ...records.map((r) => ({
      memberId: r.memberId,
      name: member(r.memberId)?.name ?? null,
      email: member(r.memberId)?.email ?? null,
      moduleId: r.moduleId,
      training: title(r.moduleId),
      completedAt: r.completedAt,
      expiresAt: r.expiresAt,
      source: r.source,
      hasAttachment: !!r.attachmentId,
    })),
    // Current portal completions not archived yet.
    ...current.flatMap((c) =>
      c.completedAt && !seen.has(`${c.memberId}|${c.videoId}|${c.completedAt.getTime()}`)
        ? [
            {
              memberId: c.memberId,
              name: member(c.memberId)?.name ?? null,
              email: member(c.memberId)?.email ?? null,
              moduleId: c.videoId,
              training: title(c.videoId),
              completedAt: c.completedAt,
              expiresAt: addMonths({ date: c.completedAt, months: TRAINING_VALIDITY_MONTHS }),
              source: 'portal',
              hasAttachment: false,
            },
          ]
        : [],
    ),
  ];
  return rows.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
}
