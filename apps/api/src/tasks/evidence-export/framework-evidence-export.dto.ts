import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ExportFrameworkEvidenceDto {
  @ApiPropertyOptional({
    description:
      'First day of the audit period (YYYY-MM-DD). Task attachments, automation runs and document submissions before it are left out.',
    example: '2026-01-01',
  })
  @IsOptional()
  @Matches(DAY, { message: 'from must be a date in YYYY-MM-DD format' })
  from?: string;

  @ApiPropertyOptional({
    description:
      'Last day of the audit period (YYYY-MM-DD), inclusive. Evidence after it is left out.',
    example: '2026-12-31',
  })
  @IsOptional()
  @Matches(DAY, { message: 'to must be a date in YYYY-MM-DD format' })
  to?: string;

  @ApiPropertyOptional({
    description:
      'An audit engagement of this framework. Adds audit-trail.csv (readiness, auditor decisions, comments) and Requests/ (evidence requests with responses and files). Requires audit read.',
    example: 'aud_abc123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  auditId?: string;
}

/** "2026-01-01_to_2026-12-31", "from_2026-01-01", "to_2026-12-31" or "all-time" (download filename). */
export function periodSlug({ from, to }: { from?: string; to?: string }): string {
  const day = (v?: string) => v?.slice(0, 10);
  if (from && to) return `${day(from)}_to_${day(to)}`;
  if (from) return `from_${day(from)}`;
  if (to) return `to_${day(to)}`;
  return 'all-time';
}

/** Day bounds of an audit period as ISO timestamps (UTC, inclusive). */
export function toPeriodBounds({ from, to }: ExportFrameworkEvidenceDto): {
  from?: string;
  to?: string;
} {
  return {
    ...(from ? { from: `${from}T00:00:00.000Z` } : {}),
    ...(to ? { to: `${to}T23:59:59.999Z` } : {}),
  };
}

/**
 * One object per run, so two exports (another period, another user's
 * permissions) never overwrite each other's download. Storage stays bounded by
 * an S3 lifecycle rule expiring `<org>/exports/` after 2 days (see README.md
 * in this folder).
 */
export function frameworkExportKey({
  organizationId,
  frameworkInstanceId,
  runId,
}: {
  organizationId: string;
  frameworkInstanceId: string;
  runId: string;
}): string {
  return `${organizationId}/exports/framework-evidence-${frameworkInstanceId}-${runId}.zip`;
}
