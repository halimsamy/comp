import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, switchMap, tap } from 'rxjs';
import { PERMISSIONS_KEY, RequiredPermission } from '../auth/permission.guard';
import { AuthenticatedRequest } from '../auth/types';
import { ActingUserResolver } from '../auth/acting-user.service';
import { AUDIT_READ_KEY, SKIP_AUDIT_LOG_KEY } from './skip-audit-log.decorator';
import { resolveAuditChanges } from './audit-log.changes';
import { MEMBER_REF_FIELDS, MUTATION_METHODS } from './audit-log.constants';
import { persistAuditLog } from './audit-log.persist';
import { errorStatus, routeLabel } from './audit-log.request-meta';
import {
  buildRelationMappingChanges,
  fetchCurrentValues,
  resolveMemberNames,
} from './audit-log.resolvers';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly actingUser: ActingUserResolver,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const method = request.method;

    const isAuditRead = this.reflector.getAllAndOverride<boolean>(
      AUDIT_READ_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!MUTATION_METHODS.has(method) && !isAuditRead) {
      return next.handle();
    }

    if (this.shouldSkip(context)) {
      return next.handle();
    }

    const requiredPermissions = this.reflector.getAllAndOverride<
      RequiredPermission[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissions?.length) {
      return next.handle();
    }

    const { organizationId, impersonatedBy } = request;
    if (!organizationId) {
      return next.handle();
    }

    const { resource, actions } = requiredPermissions[0];

    // Read-only endpoints that use a mutation HTTP verb (e.g. `POST .../list` or
    // `POST .../status` that carry a filter body) declare exactly `['read']`.
    // The method-derived verb below would log them as "Created X" on every page
    // load, so skip them — a required permission of only `read` is definitionally
    // not a mutation. `@AuditRead` opts a read endpoint back into logging.
    // Only skip when EVERY declared permission is read-only: an endpoint with
    // multiple requirements (e.g. [read, create]) still performs a mutation.
    if (
      !isAuditRead &&
      requiredPermissions.every(
        (permission) =>
          permission.actions.length === 1 && permission.actions[0] === 'read',
      )
    ) {
      return next.handle();
    }

    // Derive the actual action from the HTTP method rather than using the first
    // permission action. This is important when a controller declares multiple
    // actions (e.g. ['create','read','update','delete']) at the class level.
    const METHOD_TO_ACTION: Record<string, string> = {
      POST: 'create',
      GET: 'read',
      PATCH: 'update',
      PUT: 'update',
      DELETE: 'delete',
    };
    const action = METHOD_TO_ACTION[method] ?? actions[0];

    // `audit` guards the event log itself; audits and the SoA reuse it but are real changes.
    if (resource === 'audit' && !routeLabel(request.url)) {
      return next.handle();
    }

    const requestBody = (request as any).body as
      Record<string, unknown> | undefined;
    // Org-level settings endpoints have no :id; their record is the organization.
    const entityId =
      ((request as any).params?.id as string | undefined) ??
      (/\/v\d+\/security-settings(\?|$)/.test(request.url)
        ? organizationId
        : undefined);
    const isUpdate =
      (method === 'PATCH' || method === 'PUT') && requestBody && entityId;

    const safePreFlightPromise = this.preflight(
      request.url,
      method,
      resource,
      requestBody,
      entityId,
      isUpdate ? Object.keys(requestBody) : null,
    ).catch((err) => {
      this.logger.error(
        'Audit preflight failed, proceeding without pre-flight data',
        err,
      );
      return {
        previousValues: null,
        memberNames: {} as Record<string, string>,
        relationMappingResult: null,
      };
    });

    // Resolve who to attribute this mutation to. Session / service-token-acting
    // callers already have req.userId (zero-cost). API-key callers don't — resolve
    // the responsible user (key creator, else org owner) so the action is still
    // audited and attributed to a real person instead of being silently dropped.
    const actorPromise: Promise<{
      userId: string | null;
      memberId: string | undefined;
      // Provenance marker for non-session callers (e.g. `via API key "CI"`),
      // recorded in the audit trail so an owner-fallback / creator attribution
      // isn't mistaken for the user personally acting in a session.
      callerLabel: string | undefined;
    }> = request.userId
      ? Promise.resolve({
          userId: request.userId,
          memberId: request.memberId,
          callerLabel: undefined,
        })
      : this.actingUser
          .resolve(request, organizationId)
          .then((a) => ({
            userId: a.userId,
            memberId: a.memberId,
            callerLabel: a.callerLabel,
          }))
          .catch((err) => {
            this.logger.error('Audit actor resolution failed', err);
            return {
              userId: null,
              memberId: undefined,
              callerLabel: undefined,
            };
          });

    return from(Promise.all([safePreFlightPromise, actorPromise])).pipe(
      switchMap(
        ([{ previousValues, memberNames, relationMappingResult }, actor]) =>
          next.handle().pipe(
            tap({
              next: (responseBody) => {
                // No attributable user (e.g. an org with zero owner-role members).
                // Skip logging rather than persist a null userId FK — mirrors the
                // resolver's soft-failure contract.
                if (!actor.userId) return;

                const { changes, commentCtx, descriptionOverride } =
                  resolveAuditChanges({
                    request,
                    method,
                    resource,
                    requestBody,
                    responseBody,
                    previousValues,
                    memberNames,
                    relationMappingResult,
                  });

                void persistAuditLog({
                  organizationId,
                  userId: actor.userId,
                  memberId: actor.memberId,
                  method,
                  path: request.url,
                  resource,
                  action,
                  request,
                  responseBody,
                  changes,
                  commentContext: commentCtx,
                  descriptionOverride,
                  impersonatedBy,
                  callerLabel: actor.callerLabel,
                }).catch((err) => {
                  this.logger.error('Failed to create audit log entry', err);
                });
              },
              // Rejected mutations are evidence too (PCI DSS 10.2.1.4 / 10.2.2: outcome of the
              // action). tap re-emits the error, so the caller still gets it.
              error: (err: unknown) => {
                if (!actor.userId) return;
                void persistAuditLog({
                  organizationId,
                  userId: actor.userId,
                  memberId: actor.memberId,
                  method,
                  path: request.url,
                  resource,
                  action,
                  request,
                  responseBody: null,
                  changes: null,
                  commentContext: null,
                  descriptionOverride: null,
                  impersonatedBy,
                  callerLabel: actor.callerLabel,
                  failure: { statusCode: errorStatus(err) },
                }).catch((e) => {
                  this.logger.error('Failed to create audit log entry', e);
                });
              },
            }),
          ),
      ),
    );
  }

  private shouldSkip(context: ExecutionContext): boolean {
    return !!this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_LOG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  private async preflight(
    url: string,
    method: string,
    resource: string,
    requestBody: Record<string, unknown> | undefined,
    entityId: string | undefined,
    updateFieldNames: string[] | null,
  ) {
    const previousValues =
      updateFieldNames && entityId
        ? await fetchCurrentValues(resource, entityId, updateFieldNames)
        : null;

    const memberIds = new Set<string>();
    if (requestBody) {
      for (const field of Object.keys(MEMBER_REF_FIELDS)) {
        const newVal = requestBody[field];
        if (typeof newVal === 'string' && newVal) memberIds.add(newVal);
        const prevVal = previousValues?.[field];
        if (typeof prevVal === 'string' && prevVal) memberIds.add(prevVal);
      }
    }
    const memberNames = await resolveMemberNames([...memberIds]);

    const relationMappingResult = await buildRelationMappingChanges(
      url,
      method,
      requestBody,
      entityId,
    );

    return { previousValues, memberNames, relationMappingResult };
  }
}
