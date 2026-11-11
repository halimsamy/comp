import { db, Departments, RiskCategory, RiskStatus } from '@db';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  findSimilarContent,
  syncOrganizationEmbeddings,
  type KnowledgeSourceType,
  type SimilarContentResult,
} from '../vector-store/lib';
import { buildEvidenceTool } from './assistant-chat-evidence-tool';

const logger = new Logger('AssistantChatTools');

type Permissions = Record<string, string[]>;

// The permission that already gates each knowledge source elsewhere in the app
// (context hub = evidence, questionnaire knowledge base = questionnaire).
const KNOWLEDGE_SOURCE_PERMISSION: Record<
  KnowledgeSourceType,
  [string, string]
> = {
  policy: ['policy', 'read'],
  context: ['evidence', 'read'],
  document_hub: ['evidence', 'read'],
  attachment: ['evidence', 'read'],
  manual_answer: ['questionnaire', 'read'],
  knowledge_base_document: ['questionnaire', 'read'],
};

const knowledgeTitle = (result: SimilarContentResult) =>
  result.contextQuestion ??
  result.policyName ??
  result.manualAnswerQuestion ??
  result.documentName;

interface ToolContext {
  organizationId: string;
  userId: string;
  permissions: Permissions;
  roles: string[];
}

function hasPermission(
  permissions: Permissions,
  resource: string,
  action: string,
): boolean {
  return permissions[resource]?.includes(action) ?? false;
}

export function buildTools(ctx: ToolContext) {
  const tools: Record<
    string,
    {
      description: string;
      inputSchema: z.ZodType;
      execute: (...args: any[]) => Promise<unknown>;
    }
  > = {};

  // Always available
  tools.findOrganization = {
    description: "Find the user's organization and its details",
    inputSchema: z.object({}),
    execute: async () => {
      const org = await db.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { name: true },
      });
      return org
        ? { organization: org }
        : { organization: null, message: 'Organization not found' };
    },
  };

  tools.getUser = {
    description: "Get the user's id and organization id",
    inputSchema: z.object({}),
    execute: async () => ({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    }),
  };

  // Semantic search over the org's knowledge, limited to sources this user may read
  const readableSources = (
    Object.keys(KNOWLEDGE_SOURCE_PERMISSION) as KnowledgeSourceType[]
  ).filter((source) =>
    hasPermission(ctx.permissions, ...KNOWLEDGE_SOURCE_PERMISSION[source]),
  );
  if (readableSources.length > 0) {
    tools.searchOrganizationKnowledge = {
      description:
        "Semantic search over the organization's own knowledge: company context (infrastructure, security practices, onboarding answers), published policies, saved questionnaire answers and knowledge base documents. Use it for any question about how this company operates.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe('What to look up, in natural language'),
      }),
      execute: async ({ query }: { query: string }) => {
        // Context and policy edits aren't embedded on save; refresh first like the
        // questionnaire flow does. Incremental, so unchanged entries cost no embedding call.
        try {
          await syncOrganizationEmbeddings(ctx.organizationId);
        } catch (error) {
          logger.warn(
            `Knowledge sync failed, searching existing embeddings: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        const results = await findSimilarContent(query, ctx.organizationId, {
          sourceTypes: readableSources,
        });
        return results.length === 0
          ? { results: [], message: 'No matching organization knowledge found' }
          : {
              results: results.map((result) => ({
                source: result.sourceType,
                title: knowledgeTitle(result),
                content: result.content,
                relevance: Number(result.score.toFixed(2)),
              })),
            };
      },
    };
  }

  const evidenceTool = buildEvidenceTool(ctx);
  if (evidenceTool) tools.getEvidenceSubmissions = evidenceTool;

  // Policy tools — require policy:read
  if (hasPermission(ctx.permissions, 'policy', 'read')) {
    tools.getPolicies = {
      description: 'Get all policies for the organization',
      inputSchema: z.object({
        status: z.enum(['draft', 'published']).optional(),
      }),
      execute: async ({ status }: { status?: 'draft' | 'published' }) => {
        const policies = await db.policy.findMany({
          where: {
            organizationId: ctx.organizationId,
            isArchived: false,
            archivedAt: null,
            status,
          },
          select: { id: true, name: true, description: true, department: true },
        });
        return policies.length === 0
          ? { policies: [], message: 'No policies found' }
          : { policies };
      },
    };

    tools.getPolicyContent = {
      description:
        'Get the content of a specific policy by id. Run getPolicies first to get ids.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }: { id: string }) => {
        const policy = await db.policy.findUnique({
          where: { id, organizationId: ctx.organizationId },
          select: { content: true },
        });
        return policy
          ? { content: policy.content }
          : { content: null, message: 'Policy not found' };
      },
    };
  }

  // Risk tools — require risk:read
  if (hasPermission(ctx.permissions, 'risk', 'read')) {
    tools.getRisks = {
      description: 'Get risks for the organization',
      inputSchema: z.object({
        status: z
          .enum(Object.values(RiskStatus) as [RiskStatus, ...RiskStatus[]])
          .optional(),
        department: z
          .enum(Object.values(Departments) as [Departments, ...Departments[]])
          .optional(),
        category: z
          .enum(
            Object.values(RiskCategory) as [RiskCategory, ...RiskCategory[]],
          )
          .optional(),
        owner: z.string().optional(),
      }),
      execute: async (input: {
        status?: RiskStatus;
        department?: Departments;
        category?: RiskCategory;
        owner?: string;
      }) => {
        const risks = await db.risk.findMany({
          where: {
            organizationId: ctx.organizationId,
            status: input.status,
            department: input.department,
            category: input.category,
            assigneeId: input.owner,
          },
          select: { id: true, title: true, status: true },
        });
        return risks.length === 0
          ? { risks: [], message: 'No risks found' }
          : { risks };
      },
    };

    tools.getRiskById = {
      description: 'Get a risk by id',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }: { id: string }) => {
        const risk = await db.risk.findUnique({
          where: { id, organizationId: ctx.organizationId },
        });
        return risk ? { risk } : { risk: null, message: 'Risk not found' };
      },
    };
  }

  return tools;
}
