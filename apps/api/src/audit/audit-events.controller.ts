import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { db } from '@db';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { authMeta } from '../vendors/tpsp/auth-meta';
import {
  AuditEventsQueryDto,
  auditEventsToCsv,
  buildAuditEventsWhere,
} from './audit-events.query';
import { AuditRead } from './skip-audit-log.decorator';

/** shortcut: export holds up to 50k rows in memory; stream it if orgs outgrow that. */
export const AUDIT_EVENT_EXPORT_LIMIT = 50_000;

const USER_SELECT = { select: { id: true, name: true, email: true, image: true } } as const;

/** Org-wide event log: every audited change, sign-in, sign-out and idle timeout. */
@ApiTags('Audit Logs')
@Controller({ path: 'audit-logs', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class AuditEventsController {
  @Get('events')
  @RequirePermission('audit', 'read')
  @ApiOperation({
    summary: 'List organization events',
    description:
      'Returns the org-wide event log (changes, sign-ins, sign-outs, idle timeouts), newest first, filtered by user, resource, date range or text. Use for ISO 27001 A.8.15 / PCI DSS 10.2 review.',
  })
  async listAuditEvents(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Query() query: AuditEventsQueryDto,
  ) {
    const where = buildAuditEventsWhere({ organizationId, query });
    const [data, count] = await Promise.all([
      db.auditLog.findMany({
        where,
        select: {
          id: true,
          timestamp: true,
          description: true,
          entityType: true,
          entityId: true,
          data: true,
          user: USER_SELECT,
        },
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take: query.take ?? 50,
        skip: query.offset ?? 0,
      }),
      db.auditLog.count({ where }),
    ]);
    return { data, count, ...authMeta(authContext) };
  }

  @Get('events/export')
  @RequirePermission('audit', 'read')
  @AuditRead()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export organization events as CSV',
    description:
      'Downloads the filtered org-wide event log as CSV (user, event, resource, target, IP, sign-in method). Use as audit-log evidence for ISO 27001 A.8.15 and PCI DSS 10.2.',
  })
  @ApiResponse({ status: 200, description: 'Event log CSV' })
  async exportAuditEvents(
    @OrganizationId() organizationId: string,
    @Query() query: AuditEventsQueryDto,
    @Res() res: Response,
  ) {
    const rows = await db.auditLog.findMany({
      where: buildAuditEventsWhere({ organizationId, query }),
      select: {
        id: true,
        timestamp: true,
        description: true,
        entityType: true,
        entityId: true,
        data: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: AUDIT_EVENT_EXPORT_LIMIT,
    });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="event-log-${date}.csv"`);
    if (rows.length === AUDIT_EVENT_EXPORT_LIMIT) res.setHeader('X-Truncated', 'true');
    res.send(auditEventsToCsv(rows));
  }
}
